/**
 * Task instance lifecycle helpers — the signup-trigger fan-out and the
 * admin manual-assign entry point. See U4 in
 * `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md`.
 *
 * Both helpers run the same "create instance, evaluate predicate, then
 * either silently complete (match) or dispatch notification (no match)"
 * pipeline so behavior is uniform across trigger paths (R7, R8 revised,
 * R11, R14). The kill-switch SystemSetting `tasks.scheduler.enabled`
 * (KTD8) short-circuits both at the top.
 *
 * Contracts:
 *   - `createInstancesForSignup` is fire-and-forget from the signup
 *     route handler. Mirrors `src/lib/log.prune.ts` — wraps the body in
 *     try/catch, logs failures, and never throws.
 *   - `manuallyAssignInstance` is a synchronous admin action invoked
 *     from `/api/super-admin/tasks/{id}/assign`. It throws on
 *     unexpected DB errors so the endpoint can return 5xx; the
 *     kill-switch path throws a typed Error so the endpoint can map it
 *     to a clean 4xx.
 */

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import { dispatchTaskCreatedFor } from "@/lib/notifications";
import { evaluatePredicate } from "@/lib/predicates";
import { isTasksSchedulerEnabled } from "@/lib/system-settings";

/**
 * Error thrown when a synchronous admin trigger path runs while the
 * scheduler kill switch is off. The assign endpoint maps it to a 4xx
 * with a clear message so admins know the system is intentionally
 * paused rather than broken.
 */
export class TasksSchedulerDisabledError extends Error {
  constructor(message = "Tasks scheduler is currently disabled") {
    super(message);
    this.name = "TasksSchedulerDisabledError";
  }
}

/**
 * Signup fan-out (R7): create one pending TaskInstance per enabled
 * task definition whose triggers include `signup`, then for each
 * evaluate the predicate immediately. Matching predicates flip the
 * row to `completed` with `source: 'predicate'` silently (no
 * notification — R7). Non-matching (or no predicate) instances stay
 * pending and `dispatchTaskCreatedFor` fires a notification + email
 * (R14, R17) per the unified dispatch rule.
 *
 * Fire-and-forget contract — wrapped in try/catch + logged via
 * `logError`. Signup latency must not depend on this call.
 *
 * Kill switch (KTD8): when `tasks.scheduler.enabled` is `false`,
 * returns silently without creating instances or firing notifications.
 */
export async function createInstancesForSignup(userId: string): Promise<void> {
  try {
    if (!(await isTasksSchedulerEnabled())) return;

    // Enabled definitions where at least one trigger row has kind=signup.
    // Pull predicateKey here so we can evaluate without a second query.
    const defs = await prisma.task.findMany({
      where: {
        enabled: true,
        triggers: { some: { kind: "signup" } },
      },
      select: { id: true, predicateKey: true },
    });

    if (defs.length === 0) return;

    for (const def of defs) {
      try {
        const instance = await prisma.taskInstance.create({
          data: {
            taskId: def.id,
            userId,
            status: "pending",
            signature: "signup",
            source: null,
          },
          select: { id: true, userId: true, taskId: true },
        });

        // Evaluate predicate immediately — match means silent auto-complete
        // (R7) and no notification; non-match (or no predicate) means
        // dispatch via the unified path.
        let matched = false;
        if (def.predicateKey) {
          try {
            matched = await evaluatePredicate(def.predicateKey, userId);
          } catch (err) {
            // Unknown / broken predicate: leave the instance pending and
            // dispatch a notification as if no predicate existed. The error
            // is logged so the engineer who removed a key from the registry
            // notices the drift.
            await logError(err, {
              context: {
                feature: "tasks.signup.evaluate",
                userId,
                taskId: def.id,
                predicateKey: def.predicateKey,
              },
              userId,
            });
            matched = false;
          }
        }

        if (matched) {
          await prisma.taskInstance.update({
            where: { id: instance.id },
            data: {
              status: "completed",
              source: "predicate",
              completedAt: new Date(),
            },
          });
          continue;
        }

        await dispatchTaskCreatedFor(instance);
      } catch (innerErr) {
        // A per-definition failure (e.g. unique-constraint race) must
        // not abort the whole fan-out — log and continue with the rest.
        await logError(innerErr, {
          context: {
            feature: "tasks.signup.create",
            userId,
            taskId: def.id,
          },
          userId,
        });
      }
    }
  } catch (err) {
    await logError(err, {
      context: { feature: "tasks.signup", userId },
      userId,
    });
  }
}

/**
 * Manual admin assignment (R8 revised, KTD6, AE5 / AE5b). Creates one
 * pending TaskInstance for `(taskId, userId)` with a millisecond-
 * precision ISO signature so a re-assignment after the previous
 * instance completes is allowed (the unique key on
 * (taskId, userId, signature) only prevents two open assigns of the
 * same task to the same user at the same instant — vanishingly rare).
 *
 * Predicate evaluation:
 *   - Match → instance is created completed silently with
 *     `source: 'predicate'`. `assignedByAdminId` is still set even
 *     though the source is `predicate` (the audit trail captures the
 *     admin action regardless of how the instance ended up complete).
 *   - No match (or no predicate) → instance stays pending and
 *     `dispatchTaskCreatedFor` fires notification + email.
 *
 * Kill switch (KTD8): throws `TasksSchedulerDisabledError` when off so
 * the endpoint can map it to a 4xx — manual-assign is a synchronous
 * admin action, not a background path; the admin needs to know it
 * didn't happen.
 *
 * Returns the created (and possibly completed) instance row.
 */
export async function manuallyAssignInstance(
  taskId: string,
  userId: string,
  assignedByAdminId: string,
): Promise<{
  id: string;
  taskId: string;
  userId: string;
  status: string;
  source: string | null;
  signature: string;
  completedAt: Date | null;
  assignedByAdminId: string | null;
  completedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  if (!(await isTasksSchedulerEnabled())) {
    throw new TasksSchedulerDisabledError();
  }

  // Read the predicate up-front so we can decide the create branch.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, predicateKey: true },
  });
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const signature = `manual:${new Date().toISOString()}`;

  let matched = false;
  if (task.predicateKey) {
    try {
      matched = await evaluatePredicate(task.predicateKey, userId);
    } catch (err) {
      // Unknown predicate: treat as non-match and log. The admin still
      // gets an instance + a notification, which is the safer default.
      await logError(err, {
        context: {
          feature: "tasks.assign.evaluate",
          userId,
          taskId,
          predicateKey: task.predicateKey,
        },
        userId,
      });
      matched = false;
    }
  }

  // One create either way — branch on `status`/`source`/`completedAt`
  // up-front so we don't open a window where the row exists as pending
  // before being flipped to completed. The admin overview filters on
  // `status` and `source` so a transient pending state would be noisy.
  const now = new Date();
  const instance = await prisma.taskInstance.create({
    data: matched
      ? {
          taskId,
          userId,
          status: "completed",
          source: "predicate",
          signature,
          completedAt: now,
          assignedByAdminId,
        }
      : {
          taskId,
          userId,
          status: "pending",
          source: null,
          signature,
          assignedByAdminId,
        },
  });

  if (!matched) {
    // Non-matching path: fire notification + email per AE5. Dispatch is
    // already swallow-and-log so we don't need a try/catch here.
    await dispatchTaskCreatedFor({
      id: instance.id,
      userId: instance.userId,
      taskId: instance.taskId,
    });
  }

  return instance;
}
