import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runGlobalTick } from "@/lib/scheduler";
import { getOrCreateTickSecret } from "@/lib/system-settings";
import { tickRequestSchema } from "@/lib/validators";

/**
 * POST /api/super-admin/tasks/tick
 *
 * Scheduler tick endpoint — callable by an external cron (GitHub
 * Actions scheduled workflow, cron-job.org, etc.) to sweep due
 * recurring + specific-date triggers even when no real user is
 * actively making requests. See U6 in
 * `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md`.
 *
 * Auth (KTD1): shared-secret header `X-Tick-Secret` matched against
 * the `tasks.tick.secret` SystemSetting (constant-time compare via
 * `crypto.timingSafeEqual`). `requireSuperAdmin()` is NOT used because
 * external cron services can't hold a NextAuth JWT. The secret is
 * generated on first read (`getOrCreateTickSecret`) and rotatable
 * from `/super-admin/system-settings`.
 *
 * Response shapes:
 *   - 401 `{ code: 'INVALID_TICK_SECRET' }` — header missing or wrong
 *   - 400 — body wasn't `{}`
 *   - 200 `{ status: 'scheduler_disabled' }` — kill switch off
 *   - 200 `{ status: 'ok', usersProcessed, instancesCreated, notificationsFired }`
 *   - 202 `{ status: 'tick_skipped', reason: 'window_active' }` —
 *     within the claim window of the previous successful tick
 */
export async function POST(req: Request) {
  // 1. Header auth. Read the secret first so a missing/mismatched
  //    header fails identically (no early-return that would let a
  //    timing-side-channel infer secret presence).
  const provided = req.headers.get("x-tick-secret") ?? "";
  const expected = await getOrCreateTickSecret();
  if (!constantTimeEqualUtf8(provided, expected)) {
    return NextResponse.json(
      { error: "Invalid tick secret", code: "INVALID_TICK_SECRET" },
      { status: 401 },
    );
  }

  // 2. Empty-body validation. The tick takes no parameters; reject any
  //    stray field so a misconfigured cron with `{ secret: ... }` in
  //    the body fails loudly.
  const body = await req.json().catch(() => null);
  // An absent body is treated as `{}` — many cron services send no
  // body at all. The `.strict()` guard still catches malformed objects.
  const parsed = tickRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // 3. Dispatch. The helper handles the kill switch + window claim
  //    internally and returns a discriminated result.
  const result = await runGlobalTick();

  if (result.status === "tick_skipped") {
    return NextResponse.json(result, { status: 202 });
  }
  return NextResponse.json(result, { status: 200 });
}

/**
 * Constant-time UTF-8 string equality. `crypto.timingSafeEqual` throws
 * when the two buffers have different lengths, so wrap the length check
 * first; a length mismatch is also branch-leaking but the secret is a
 * fixed 64-char hex string so attackers can't infer anything useful
 * from the length-mismatch branch.
 */
function constantTimeEqualUtf8(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
