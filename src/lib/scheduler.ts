/**
 * Scheduler — lazy-eval per authed request + admin tick for external
 * cron coverage. See U6 in
 * `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md`.
 *
 * Two entry points, one shared per-user processor:
 *
 *   - `maybeProcessUserTriggers(userId)` — fire-and-forget from
 *     `writeLogEntry` (and any other opportunistic per-request hook).
 *     Claims `tasks.user.lastRunAt.<userId>` via SystemSetting so the
 *     same user's scheduler work runs at most once per
 *     `tasks.scheduler.userWindowMs` (default 5 min).
 *
 *   - `runGlobalTick()` — called by `POST /api/super-admin/tasks/tick`
 *     (shared-secret authenticated). Claims `tasks.tick.lastRunAt`
 *     globally; iterates enabled definitions with recurring or dated
 *     triggers; iterates every user in batches; defers per-user work
 *     to `processDueTriggersForUser`.
 *
 *   - `processDueTriggersForUser(userId)` — the actual per-user work.
 *     For each recurring / specific-date trigger on each enabled
 *     definition, decides whether a new TaskInstance is due and (if so)
 *     creates it via the signature contract from KTD10 — then evaluates
 *     the predicate and routes through `dispatchTaskCreatedFor` so
 *     notifications + emails fire per the unified rule.
 *
 * Kill-switch (KTD8): every entry point checks `isSchedulerEnabled()`
 * first and returns silently when disabled. Mirrors the existing
 * short-circuit in `createInstancesForSignup`, `manuallyAssignInstance`
 * and `runBackfillForDefinition`.
 *
 * Time anchor: UTC for v1 (KTD1). `YYYY-MM-DD` comparisons are sliced
 * off `new Date().toISOString()`; interval math is plain ms subtraction
 * against `intervalDays * 86_400_000`.
 *
 * Signature precedence (KTD10): recurring instances use
 * `recurring:<cycleStartIso>`, dated use `specific-date:<YYYY-MM-DD>`,
 * signup uses literal `"signup"`. The signatures are distinct so the
 * unique key `(taskId, userId, signature)` never collides — but the
 * recurring branch *also* short-circuits when any pending instance for
 * `(taskId, userId)` exists, regardless of signature, so AE7 (R9
 * revised) holds even when the pending instance came from signup or
 * backfill.
 */

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import { dispatchTaskCreatedFor } from "@/lib/notifications";
import { evaluatePredicate } from "@/lib/predicates";
import {
  SETTING_KEYS,
  getBackfillBatchSize,
  getSchedulerUserWindowMs,
  getSetting,
  getTickWindowMs,
  isTasksSchedulerEnabled,
  setSetting,
  tasksUserLastRunAtKey,
} from "@/lib/system-settings";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Re-export of the kill-switch check so the scheduler module is the
 * single import for all dispatch entry points. Callers may also
 * import `isTasksSchedulerEnabled` from `system-settings` directly —
 * they share the same DB read.
 */
export async function isSchedulerEnabled(): Promise<boolean> {
  return isTasksSchedulerEnabled();
}

export type GlobalTickResult =
  | {
      status: "ok";
      usersProcessed: number;
      instancesCreated: number;
      notificationsFired: number;
    }
  | { status: "scheduler_disabled" }
  | { status: "tick_skipped"; reason: "window_active" };

export type PerUserProcessResult = {
  instancesCreated: number;
  notificationsFired: number;
};

/**
 * Lazy per-user scheduler entry point — fire-and-forget from any
 * authed-request hook (e.g. `writeLogEntry`). Claims
 * `tasks.user.lastRunAt.<userId>` so a single user's scheduler work
 * runs at most once per window. Never throws.
 */
export async function maybeProcessUserTriggers(userId: string): Promise<void> {
  try {
    if (!(await isSchedulerEnabled())) return;

    const windowMs = await getSchedulerUserWindowMs();
    const key = tasksUserLastRunAtKey(userId);
    const last = await getSetting(key);
    if (last) {
      const lastMs = Date.parse(last);
      if (Number.isFinite(lastMs) && Date.now() - lastMs < windowMs) {
        return;
      }
    }
    // Claim the window before doing the work — matches
    // `maybePruneLogEntries`. SystemSetting is last-writer-wins so two
    // concurrent claims can both proceed; the per-instance signature
    // uniqueness in `TaskInstance` makes the rare double-create
    // idempotent (per KTD10 + R5).
    await setSetting(key, new Date().toISOString());
    await processDueTriggersForUser(userId);
  } catch (err) {
    await logError(err, {
      context: { feature: "tasks.scheduler.user", userId },
      userId,
    });
  }
}

/**
 * Iterate enabled definitions that carry at least one recurring or
 * specific-date trigger; for each, decide whether a new TaskInstance
 * is due for this user and (if so) create it + route the result
 * through `dispatchTaskCreatedFor`.
 *
 * Throws are the caller's responsibility to handle — `maybeProcessUserTriggers`
 * and `runGlobalTick` wrap this in try/catch + `logError` per the
 * fire-and-forget contract.
 *
 * Returns aggregate counters so the tick endpoint can report stats.
 */
export async function processDueTriggersForUser(
  userId: string,
): Promise<PerUserProcessResult> {
  const result: PerUserProcessResult = {
    instancesCreated: 0,
    notificationsFired: 0,
  };

  // Enabled definitions where at least one trigger is recurring OR
  // specific_date. We need the triggers themselves to evaluate
  // intervals + date lists, and the predicateKey to route the
  // post-create dispatch.
  const defs = await prisma.task.findMany({
    where: {
      enabled: true,
      triggers: { some: { kind: { in: ["recurring", "specific_date"] } } },
    },
    select: {
      id: true,
      predicateKey: true,
      triggers: {
        select: {
          id: true,
          kind: true,
          intervalDays: true,
          dateList: true,
          createdAt: true,
        },
      },
    },
  });

  if (defs.length === 0) return result;

  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);

  for (const def of defs) {
    for (const trigger of def.triggers) {
      if (trigger.kind === "recurring") {
        const created = await processRecurringTrigger(
          def.id,
          def.predicateKey,
          trigger,
          userId,
          now,
        );
        if (created) {
          result.instancesCreated += 1;
          if (created.notified) result.notificationsFired += 1;
        }
      } else if (trigger.kind === "specific_date") {
        const created = await processSpecificDateTrigger(
          def.id,
          def.predicateKey,
          trigger,
          userId,
          todayUtc,
        );
        result.instancesCreated += created.instancesCreated;
        result.notificationsFired += created.notificationsFired;
      }
    }
  }

  return result;
}

/**
 * Recurring trigger: KTD7 says no new instance while a pending one
 * exists; KTD1 says the first cycle is anchored at `TaskTrigger.createdAt`
 * when no prior completed instance exists. We compute the baseline
 * timestamp accordingly and only create when `now - baseline >= intervalDays`.
 *
 * Returns the created instance metadata (or null if not due / blocked).
 */
async function processRecurringTrigger(
  taskId: string,
  predicateKey: string | null,
  trigger: { intervalDays: number | null; createdAt: Date },
  userId: string,
  now: Date,
): Promise<{ id: string; notified: boolean } | null> {
  if (!trigger.intervalDays || trigger.intervalDays < 1) return null;

  // KTD7: a pending instance for this (taskId, userId) blocks the next
  // cycle regardless of which signature created it. Includes signup
  // and backfill rows — the cycle is logically "blocked by open work".
  const pending = await prisma.taskInstance.findFirst({
    where: { taskId, userId, status: "pending" },
    select: { id: true },
  });
  if (pending) return null;

  // Cycle baseline — most recent completed instance's completedAt, or
  // (KTD1 first-cycle rule) the trigger's createdAt when no prior
  // instance exists.
  const lastCompleted = await prisma.taskInstance.findFirst({
    where: { taskId, userId, status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  const baseline = lastCompleted?.completedAt ?? trigger.createdAt;
  const elapsed = now.getTime() - baseline.getTime();
  if (elapsed < trigger.intervalDays * MS_PER_DAY) return null;

  const cycleStartIso = now.toISOString();
  const signature = `recurring:${cycleStartIso}`;

  // Predicate evaluation up-front so we can decide pending vs auto-complete
  // in a single create. Mirrors `manuallyAssignInstance`'s pattern.
  let matched = false;
  if (predicateKey) {
    try {
      matched = await evaluatePredicate(predicateKey, userId);
    } catch (err) {
      await logError(err, {
        context: {
          feature: "tasks.scheduler.recurring.evaluate",
          userId,
          taskId,
          predicateKey,
        },
        userId,
      });
      matched = false;
    }
  }

  try {
    const instance = await prisma.taskInstance.create({
      data: matched
        ? {
            taskId,
            userId,
            status: "completed",
            source: "predicate",
            signature,
            completedAt: now,
          }
        : {
            taskId,
            userId,
            status: "pending",
            source: null,
            signature,
          },
    });

    if (matched) return { id: instance.id, notified: false };

    await dispatchTaskCreatedFor({
      id: instance.id,
      userId: instance.userId,
      taskId: instance.taskId,
    });
    return { id: instance.id, notified: true };
  } catch (err) {
    // Race on the unique key — another scheduler claim created the same
    // recurring instance for this cycle. Swallow + log; counters stay
    // tied to the claim that won.
    await logError(err, {
      context: {
        feature: "tasks.scheduler.recurring.create",
        userId,
        taskId,
      },
      userId,
    });
    return null;
  }
}

/**
 * Specific-date trigger: split `dateList` on '\n', drop any date in
 * the future (UTC), upsert one instance per due date per user keyed on
 * `signature: "specific-date:<YYYY-MM-DD>"`. Idempotency falls out of
 * the unique key — second pass through the same date upserts to a
 * no-op `update: {}`.
 */
async function processSpecificDateTrigger(
  taskId: string,
  predicateKey: string | null,
  trigger: { dateList: string | null },
  userId: string,
  todayUtc: string,
): Promise<PerUserProcessResult> {
  const result: PerUserProcessResult = {
    instancesCreated: 0,
    notificationsFired: 0,
  };
  if (!trigger.dateList) return result;

  const dueDates = trigger.dateList
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .filter((d) => d <= todayUtc);

  if (dueDates.length === 0) return result;

  for (const date of dueDates) {
    const signature = `specific-date:${date}`;

    // Skip work if an instance already exists for this (taskId, userId,
    // signature). The upsert below would also succeed via `update: {}`
    // but we'd burn predicate evaluation + a dispatch attempt; the
    // pre-check keeps reruns cheap.
    const existing = await prisma.taskInstance.findUnique({
      where: {
        taskId_userId_signature: { taskId, userId, signature },
      },
      select: { id: true },
    });
    if (existing) continue;

    let matched = false;
    if (predicateKey) {
      try {
        matched = await evaluatePredicate(predicateKey, userId);
      } catch (err) {
        await logError(err, {
          context: {
            feature: "tasks.scheduler.dated.evaluate",
            userId,
            taskId,
            predicateKey,
            date,
          },
          userId,
        });
        matched = false;
      }
    }

    const now = new Date();
    try {
      const instance = await prisma.taskInstance.upsert({
        where: {
          taskId_userId_signature: { taskId, userId, signature },
        },
        create: matched
          ? {
              taskId,
              userId,
              status: "completed",
              source: "predicate",
              signature,
              completedAt: now,
            }
          : {
              taskId,
              userId,
              status: "pending",
              source: null,
              signature,
            },
        update: {},
      });

      result.instancesCreated += 1;
      if (instance.status === "completed") continue;

      await dispatchTaskCreatedFor({
        id: instance.id,
        userId: instance.userId,
        taskId: instance.taskId,
      });
      result.notificationsFired += 1;
    } catch (err) {
      await logError(err, {
        context: {
          feature: "tasks.scheduler.dated.create",
          userId,
          taskId,
          date,
        },
        userId,
      });
    }
  }

  return result;
}

/**
 * Global tick — called by `POST /api/super-admin/tasks/tick` (the
 * external-cron-callable endpoint). Sweeps every user against every
 * enabled recurring / dated definition. Re-entrant safe via the
 * `tasks.tick.lastRunAt` claim window; an overlapping tick returns
 * `{ status: 'tick_skipped', reason: 'window_active' }`.
 *
 * Iteration shape:
 *   - Cursor-paginate `User` rows in batches of `tasks.backfill.batchSize`.
 *     We reuse the existing knob rather than introducing
 *     `tasks.tick.batchSize` because the iteration shape and SQLite
 *     write-contention concerns are identical to backfill.
 *   - Per user, call `processDueTriggersForUser`. Errors are caught at
 *     the per-user level so one bad user can't abort the sweep.
 *
 * Always returns a discriminated result — callers map directly to
 * 200 / 202 status codes.
 */
export async function runGlobalTick(): Promise<GlobalTickResult> {
  if (!(await isSchedulerEnabled())) {
    return { status: "scheduler_disabled" };
  }

  const windowMs = await getTickWindowMs();
  const last = await getSetting(SETTING_KEYS.tasksTickLastRunAt);
  if (last) {
    const lastMs = Date.parse(last);
    if (Number.isFinite(lastMs) && Date.now() - lastMs < windowMs) {
      return { status: "tick_skipped", reason: "window_active" };
    }
  }
  // Claim the window before doing the work — same last-writer-wins
  // shape as `maybePruneLogEntries` and `maybeProcessUserTriggers`.
  await setSetting(SETTING_KEYS.tasksTickLastRunAt, new Date().toISOString());

  const batchSize = await getBackfillBatchSize();

  let usersProcessed = 0;
  let instancesCreated = 0;
  let notificationsFired = 0;
  let cursor: string | undefined;

  while (true) {
    const users = await prisma.user.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (users.length === 0) break;

    for (const user of users) {
      usersProcessed += 1;
      try {
        const perUser = await processDueTriggersForUser(user.id);
        instancesCreated += perUser.instancesCreated;
        notificationsFired += perUser.notificationsFired;
      } catch (err) {
        await logError(err, {
          context: { feature: "tasks.scheduler.tick.user", userId: user.id },
          userId: user.id,
        });
      }
    }

    cursor = users[users.length - 1]!.id;
    if (users.length < batchSize) break;
  }

  return {
    status: "ok",
    usersProcessed,
    instancesCreated,
    notificationsFired,
  };
}
