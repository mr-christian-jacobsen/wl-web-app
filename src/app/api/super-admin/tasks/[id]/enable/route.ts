import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { getMaxEmailsPerEnable } from "@/lib/system-settings";
import { countBackfillTargets, runBackfillForDefinition } from "@/lib/tasks";
import { enableTaskSchema } from "@/lib/validators";

/**
 * POST /api/super-admin/tasks/{id}/enable
 *
 * Flip a task definition from disabled to enabled and kick off a
 * backfill that creates one TaskInstance per existing user without an
 * open instance. The admin chooses per call whether the backfill
 * notifies (in-app + email per non-matching predicate) or runs
 * silently. See U5 in
 * `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md`.
 *
 * Contract:
 *   - `requireSuperAdmin()` first.
 *   - `409 ALREADY_ENABLED` when the task is already enabled.
 *     Idempotency: clicking Enable twice produces a clean error rather
 *     than a duplicate backfill.
 *   - `422 EMAIL_CAP_EXCEEDED` when notify=true AND the eligible
 *     target count exceeds `tasks.backfill.maxEmailsPerEnable` (default
 *     1000). Silent backfill is unaffected by the cap. The response
 *     body carries `eligible` + `cap` + an `action` hint so the admin
 *     UI can suggest "raise the cap, or run silent then notify
 *     selectively" without inventing the copy.
 *   - On success: flip `enabled = true` in a single transaction, then
 *     fire `runBackfillForDefinition` fire-and-forget and return
 *     `202 Accepted` with `{ status: 'backfill_started', eligible }`.
 *     The 202 is intentional — the work runs in the background per
 *     the `log.prune` precedent so the admin UI doesn't hang on a
 *     potentially 10k-row sweep.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id: taskId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = enableTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, enabled: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.enabled) {
    return NextResponse.json(
      {
        error: "Task is already enabled",
        code: "ALREADY_ENABLED",
      },
      { status: 409 },
    );
  }

  const eligible = await countBackfillTargets(taskId);

  // Email cap pre-check (KTD8): only applies to the notify path. The
  // silent path can backfill against the whole user base without
  // touching the email channel.
  if (parsed.data.notify) {
    const cap = await getMaxEmailsPerEnable();
    if (eligible > cap) {
      return NextResponse.json(
        {
          error: "Email cap exceeded for notify backfill",
          code: "EMAIL_CAP_EXCEEDED",
          eligible,
          cap,
          action:
            "raise tasks.backfill.maxEmailsPerEnable or run silent then notify selectively",
        },
        { status: 422 },
      );
    }
  }

  // Flip enabled=true. `updatedAt` is auto-managed by Prisma and acts
  // as the "enabled at" timestamp used by the backfill row signature.
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { enabled: true },
    select: { updatedAt: true },
  });

  // Fire-and-forget. The 202 returns immediately; failures inside the
  // function are swallow-and-logged via `logError` per the
  // `log.prune.ts` precedent.
  void runBackfillForDefinition(taskId, {
    notify: parsed.data.notify,
    enabledAt: updated.updatedAt,
  });

  return NextResponse.json(
    {
      status: "backfill_started",
      eligible,
    },
    { status: 202 },
  );
}
