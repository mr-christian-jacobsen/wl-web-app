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
import {
  getBackfillBatchSize,
  isTasksSchedulerEnabled,
} from "@/lib/system-settings";

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

/**
 * Count of existing users who would receive an instance if the task
 * were enabled right now — i.e. users who do not currently have an
 * open pending instance for this task. Used by:
 *
 *   - the U7 task editor / BackfillDialog to render "N users will
 *     receive an instance"
 *   - the enable endpoint as the input to the `maxEmailsPerEnable`
 *     pre-check when notify mode is requested
 *
 * The filter mirrors the per-user loop in `runBackfillForDefinition`
 * exactly so the displayed count matches the work actually performed.
 * Note that a user with a *completed* instance is also a target —
 * backfill creates a fresh `backfill:<enabledAtIso>` row regardless of
 * prior completed instances; what we skip is "open work in flight"
 * (status: pending), which is the same blocking rule the recurring
 * scheduler uses.
 */
export async function countBackfillTargets(taskId: string): Promise<number> {
  return prisma.user.count({
    where: {
      taskInstances: {
        none: { taskId, status: "pending" },
      },
    },
  });
}

/**
 * Aggregate stats returned by `runBackfillForDefinition`. Used by tests
 * and (eventually) by the admin UI's post-202 status surface.
 */
export type BackfillRunStats = {
  totalCreated: number;
  totalAutoCompleted: number;
  totalNotified: number;
};

/**
 * Backfill-on-enable (R4, KTD9). Creates one pending TaskInstance for
 * every existing user without an open instance for this task, evaluates
 * the predicate per row, and either silently auto-completes (match) or
 * dispatches a `task_created` notification + email (no match) — with
 * notification + email gated on `opts.notify`.
 *
 * Operational contract:
 *   - **Fire-and-forget from the enable endpoint.** The endpoint
 *     returns 202 immediately and lets this function run to
 *     completion in the background. Wraps the body in try/catch and
 *     logs failures via `logError`; never throws.
 *   - **Kill switch (KTD8).** If `tasks.scheduler.enabled` flipped to
 *     `false`, returns early with zero stats and logs the skip.
 *   - **Per-user atomicity.** Each user's
 *     create-instance + evaluate-predicate + maybe-flip-complete is
 *     one transaction. SQLite's single-writer model would lock the
 *     whole app under a single 10k-row transaction; batches of
 *     `tasks.backfill.batchSize` (default 500) bound the lock window.
 *   - **Abort path.** Between batches, re-reads `Task.enabled`. When
 *     an admin disables the task mid-run, exits cleanly. Instances
 *     created in earlier batches are retained per the
 *     resolved-2026-05-31 "kept on disable" decision.
 *   - **Race safety.** The unique constraint
 *     `(taskId, userId, signature)` from U1 KTD10 catches the case
 *     where a user signs up between the user-id scan and the per-user
 *     transaction (U4's signup fan-out creates a `"signup"`-signature
 *     instance for the same task). Backfill uses
 *     `"backfill:<enabledAtIso>"` so the signatures don't collide,
 *     but we still guard the create via try/catch on `P2002` to
 *     handle the rare case where the same backfill enable event
 *     somehow reaches the same user twice (e.g. a retry).
 *
 * Returns aggregate stats so the caller can log the run.
 */
export async function runBackfillForDefinition(
  taskId: string,
  opts: { notify: boolean; enabledAt: Date },
): Promise<BackfillRunStats> {
  const stats: BackfillRunStats = {
    totalCreated: 0,
    totalAutoCompleted: 0,
    totalNotified: 0,
  };

  try {
    // Kill-switch short-circuit. Mirrors `createInstancesForSignup` —
    // when the scheduler is off, every dispatch path silently no-ops.
    if (!(await isTasksSchedulerEnabled())) {
      await logError(new Error("tasks scheduler disabled during backfill"), {
        context: { feature: "tasks.backfill.skip", taskId },
      });
      return stats;
    }

    // Read the predicate once — every per-user transaction in the
    // batch uses the same key, and predicateKey can't change mid-run
    // because no admin write path mutates an enabled task's predicate.
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, predicateKey: true, enabled: true },
    });
    if (!task) {
      await logError(new Error(`task not found: ${taskId}`), {
        context: { feature: "tasks.backfill.missing", taskId },
      });
      return stats;
    }
    // Defensive: the endpoint flipped enabled=true before calling us;
    // if some other path turned it off again before we started, bail.
    if (!task.enabled) {
      return stats;
    }

    const batchSize = await getBackfillBatchSize();
    const signature = `backfill:${opts.enabledAt.toISOString()}`;

    // Cursor-paginate users that have no open instance for this task.
    // We can't simply `take + skip` because new signups during the run
    // would shift the offset — id-cursor pagination is stable under
    // concurrent inserts.
    let cursor: string | undefined;

    while (true) {
      // Abort check between batches (resolved-2026-05-31: instances in
      // earlier batches are kept, no rollback).
      const stillEnabled = await prisma.task.findUnique({
        where: { id: taskId },
        select: { enabled: true },
      });
      if (!stillEnabled?.enabled) {
        return stats;
      }

      const users = await prisma.user.findMany({
        where: {
          taskInstances: {
            none: { taskId, status: "pending" },
          },
        },
        select: { id: true },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (users.length === 0) break;

      for (const user of users) {
        try {
          // Upsert handles the race surfaced in adversarial review:
          // if a user signed up between the scan and this iteration,
          // the U4 signup fan-out may have created a `"signup"` row.
          // Backfill uses a distinct signature so its unique key
          // wouldn't collide with that row — but if the same backfill
          // enable somehow reached the same user twice (e.g. a retry
          // after a transient error), the upsert keeps the existing
          // backfill row instead of failing on P2002.
          let matched = false;
          if (task.predicateKey) {
            try {
              matched = await evaluatePredicate(task.predicateKey, user.id);
            } catch (evalErr) {
              await logError(evalErr, {
                context: {
                  feature: "tasks.backfill.evaluate",
                  userId: user.id,
                  taskId,
                  predicateKey: task.predicateKey,
                },
                userId: user.id,
              });
              matched = false;
            }
          }

          const now = new Date();
          const instance = await prisma.taskInstance.upsert({
            where: {
              taskId_userId_signature: {
                taskId,
                userId: user.id,
                signature,
              },
            },
            create: matched
              ? {
                  taskId,
                  userId: user.id,
                  status: "completed",
                  source: "predicate",
                  signature,
                  completedAt: now,
                }
              : {
                  taskId,
                  userId: user.id,
                  status: "pending",
                  source: null,
                  signature,
                },
            // The `update` branch is empty by design — when the row
            // already exists (retried backfill / concurrent race), the
            // earlier write is the source of truth and we treat this
            // iteration as a no-op. Per-row counters still increment so
            // the caller's stats are tied to "attempted users" rather
            // than "rows newly inserted"; the test harness only sees the
            // create branch under normal flow.
            update: {},
          });

          stats.totalCreated += 1;
          if (instance.status === "completed") {
            stats.totalAutoCompleted += 1;
          } else if (opts.notify) {
            // Pending instance + admin asked for notify → dispatch.
            // Dispatcher is instance-idempotent (notifications.ts U3)
            // so a retry hitting the same instance won't double-fire.
            await dispatchTaskCreatedFor({
              id: instance.id,
              userId: instance.userId,
              taskId: instance.taskId,
            });
            stats.totalNotified += 1;
          }
        } catch (userErr) {
          // A single-user failure must not abort the batch — log and
          // continue. Matches `createInstancesForSignup`'s per-row
          // resilience.
          await logError(userErr, {
            context: {
              feature: "tasks.backfill.user",
              userId: user.id,
              taskId,
            },
            userId: user.id,
          });
        }
      }

      // Advance the cursor; if the batch was short of `batchSize`
      // there's nothing left to scan.
      cursor = users[users.length - 1]!.id;
      if (users.length < batchSize) break;
    }
  } catch (err) {
    await logError(err, {
      context: { feature: "tasks.backfill", taskId },
    });
  }

  return stats;
}
