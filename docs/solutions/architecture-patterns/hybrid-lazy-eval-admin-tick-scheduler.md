---
id: SOL-2026-013
title: Hybrid lazy-eval + admin-tick scheduler for Next.js without background-job infrastructure
date: 2026-06-01
status: active
category: docs/solutions/architecture-patterns
module: Scheduling / background work (src/lib/scheduler.ts)
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "The app has no existing background-job framework (no Sidekiq, no BullMQ, no dedicated worker pool) and isn't ready to adopt one"
  - "Recurring or scheduled work needs to fire reliably even when traffic is sparse — lazy-eval per request alone won't cover idle stretches"
  - "Deployment target hasn't committed to Vercel Cron, AWS EventBridge, or a comparable platform-specific scheduler"
  - "External cron services (GitHub Actions, cron-job.org, EasyCron) need to call a server endpoint without holding a session cookie"
  - "An ops-level kill switch is required so a misbehaving scheduler can be disabled instantly without a redeploy"
related_components:
  - database
  - authentication
  - tooling
tags:
  - app-router
  - cron
  - instrumentation
  - nextjs
  - prisma
  - scheduler
  - shared-secret
  - system-settings
---

# Hybrid lazy-eval + admin-tick scheduler for Next.js without background-job infrastructure

## Context

The wl-web-app codebase needed cadence work — fire recurring task instances, expire stale rows, re-evaluate triggers — but had no scheduler infrastructure in place. No Sidekiq, no Vercel Cron wired up, no scheduled GitHub Actions workflow against the deploy, no dedicated worker process. Picking one of those would mean committing to a deploy target (Vercel Cron locks in Vercel and effectively rules out the default SQLite store), standing up new infrastructure (a worker process needs hosting and supervision), or front-loading platform decisions the team explicitly wanted to defer until product shape stabilised.

The pattern that landed combines two complementary mechanisms behind a single ops-controlled kill switch: lazy-eval per request (active users opportunistically process their own due work), plus an external-cron-callable admin tick endpoint (a shared-secret HTTP entry point any cron service can hit to cover dormant users). It directly extends the precedent in `src/lib/log.prune.ts`, which already uses `void maybePruneLogEntries()` inside `writeLogEntry` to keep log-pruning off the request critical path without ever scheduling a real job. Worth flagging: this is now the *second* instance of the lazy-eval claim-window shape in the codebase, which makes it an established convention rather than a one-off.

The broader observation: Next.js App Router does not ship a scheduler. Apps either adopt a platform-specific solution (Vercel Cron, Cloudflare Cron Triggers) or stand up something custom. This pattern is the "something custom" that stays deploy-target-portable and rollback-friendly.

## Guidance

### Mechanism 1 — Lazy-eval per request

Wire a fire-and-forget call into an existing high-traffic authenticated code path. In wl-web-app, `src/lib/log.server.ts:writeLogEntry()` ends with:

```ts
void maybePruneLogEntries();
if (input.userId) {
  void maybeProcessUserTriggers(input.userId);
}
```

The `userId` gate matters: anonymous log writes (e.g. client errors via `/api/log`) skip the tasks dispatch. Without that gate, anonymous traffic would either no-op noisily or try to process work for a user that isn't there.

### Mechanism 2 — `SystemSetting` claim window

Each `maybeProcess<Thing>` helper reads a per-user "last ran at" key (`tasks.user.lastRunAt.${userId}`), compares it against a configurable window (`tasks.scheduler.userWindowMs`, default 5 minutes), and short-circuits if the window is still active. The claim is last-writer-wins — two concurrent claims may both proceed — and that's fine because the actual write step is idempotent at the database: `TaskInstance` has a `@@unique([taskId, userId, signature])` constraint that turns a duplicate create into a no-op. The shape mirrors `src/lib/log.prune.ts` exactly; reuse that file's `getSetting` / `setSetting` calls rather than inventing a parallel mechanism.

### Mechanism 3 — External-cron-callable tick endpoint

`POST /api/super-admin/tasks/tick` authenticates via an `X-Tick-Secret` header, not a session cookie, because external cron services can't hold a NextAuth JWT. The secret lives in a `SystemSetting` row (`tasks.tick.secret`, `isSecret: true` so the admin UI masks it). First-boot bootstrap inside `getOrCreateTickSecret()`:

```ts
const existing = await getSetting("tasks.tick.secret");
if (existing) return existing;
const secret = crypto.randomBytes(32).toString("hex");
await setSetting("tasks.tick.secret", secret, { isSecret: true });
logger.info({ secret }, "Generated tasks.tick.secret (one-time log)");
return secret;
```

Logging the freshly generated secret once on first creation lets ops capture it for cron configuration without needing to query the DB.

Compare via a length-checked constant-time equality helper:

```ts
function constantTimeEqualUtf8(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
```

`crypto.timingSafeEqual` throws on length mismatch, so the length pre-check is mandatory. It is itself branch-leaking, but the secret is fixed-length 64 hex chars; a length mismatch leaks nothing useful.

The handler order is load-bearing: secret check → kill switch → global window claim (`tasks.tick.lastRunAt`) → iterate enabled definitions → cursor-paginate users in batches (`tasks.backfill.batchSize`) → call `processDueTriggersForUser(userId)` per user → return aggregated stats. Window-active returns `202` with `{ status: 'tick_skipped', reason: 'window_active' }`; kill switch off returns `200` with `{ status: 'scheduler_disabled' }`. Both are deliberately non-error responses so cron services don't alert.

### Mechanism 4 — The kill switch must be threaded everywhere

A single `tasks.scheduler.enabled` `SystemSetting` (default `true`) is the first short-circuit in *every* dispatch entry point. In wl-web-app that means all of:

- `maybeProcessUserTriggers`
- `runGlobalTick`
- `dispatchTaskCreatedFor`
- `runBackfillForDefinition`
- `manuallyAssignInstance`
- `createInstancesForSignup`

A kill switch only delivers value if it's wired everywhere. Half-wired (e.g. only the lazy-eval path checks it) and an admin who flips it expecting silence still gets signup-triggered work firing — which defeats the point of the switch as an ops-level rollback.

### Time semantics

All dates and recurring math operate in UTC for v1. Specific-date trigger strings (`YYYY-MM-DD`) are interpreted as "that day in UTC". Recurring `intervalDays` uses UTC midnight boundaries. First-cycle baseline for recurring triggers (when no completed instance exists yet) uses the trigger row's own `createdAt` — predictable first-fire window rather than firing-on-create. Per-admin or per-user timezone interpretation is a v2 candidate. Commit to UTC explicitly in v1 rather than letting `new Date()` defaults leak local-time semantics into the schedule.

## Why This Matters

This pattern lets a team defer the "what scheduler do we adopt" decision indefinitely while still shipping cadence work. The two mechanisms are complementary: lazy-eval covers active users for free (they're already making requests; piggyback on that traffic), and the tick endpoint covers dormant users without standing up any runtime infrastructure in the app itself. Adopting Vercel Cron, a managed worker, or a scheduled GitHub Actions workflow against the tick endpoint is a one-line change later — the app keeps working either way.

The kill switch buys real ops leverage. When a recurring-trigger bug starts producing wrong instances at 2am, an admin flips `tasks.scheduler.enabled` to `false` from `/super-admin/system-settings` and the bleeding stops within seconds — no redeploy, no rollback, no on-call escalation past "open the admin panel". This only works because the switch is threaded into every dispatch entry point (see Mechanism 4); a half-wired switch is worse than no switch because it gives a false sense of control.

The shared-secret + external-cron contract is portable. Today's cron caller might be a GitHub Actions workflow; tomorrow's might be `cron-job.org`, Vercel Cron, or a sidecar inside a self-hosted Kubernetes deployment. None of those care what the rest of the app looks like — they need a URL and a secret. Moving between them is a config change in the cron service, not a code change in the app.

## When to Apply

**Apply when:**

- The app needs to fire work on a cadence (recurring instances, periodic cleanup, scheduled re-evaluation) but has not yet committed to a scheduler platform.
- There is already at least one high-traffic authenticated code path (a logging hook, a request middleware, a session-touch) where a fire-and-forget call can piggyback without measurably slowing requests.
- The cadence work is naturally idempotent at the database layer (e.g. a unique constraint that turns duplicate creates into no-ops), so concurrent fires are safe.
- A reasonable freshness window of "active users see their work within ~minutes" is acceptable; sub-minute SLAs are not required.
- The team values ops-level rollback (admin toggle) over compile-time correctness guarantees.
- The deploy target is not yet fixed, or is intentionally portable across SQLite / Postgres / Vercel / self-hosted.

**Do NOT apply when** (these are new claims made here, not pre-established facts):

- The app already commits to a managed scheduler (Vercel Cron, Cloud Scheduler, Sidekiq). Use it directly — the patterns above add complexity that the managed scheduler already solves.
- Work must run on sub-minute cadence or with hard latency SLAs. A dedicated worker process gives you predictable scheduling; lazy-eval inherently lags real traffic.
- The cadence work is *not* idempotent at the DB layer. Without a unique constraint or equivalent, concurrent fires from lazy-eval + tick will produce duplicates.
- The app has no authenticated traffic at all (e.g. a fully public marketing site with a scheduled side-job). The lazy-eval half of the pattern has nothing to attach to; just adopt a cron service directly.

## Examples

### A. Tick endpoint skeleton — `src/app/api/super-admin/tasks/tick/route.ts`

```ts
export async function POST(req: Request) {
  const provided = req.headers.get("x-tick-secret") ?? "";
  const expected = await getOrCreateTickSecret();
  if (!provided || !constantTimeEqualUtf8(provided, expected)) {
    return NextResponse.json({ error: "INVALID_TICK_SECRET" }, { status: 401 });
  }
  if (!(await isSchedulerEnabled())) {
    return NextResponse.json({ status: "scheduler_disabled" });
  }
  const claimed = await claimGlobalWindow("tasks.tick.lastRunAt");
  if (!claimed) {
    return NextResponse.json(
      { status: "tick_skipped", reason: "window_active" },
      { status: 202 }
    );
  }
  const stats = await runGlobalTick();
  return NextResponse.json({ status: "ok", ...stats });
}
```

The route does not call `requireSuperAdmin()` — the shared-secret header *is* the auth. This is the only `/api/super-admin/**` endpoint exempt from the session-cookie check, and the exemption is intentional and documented in the handler.

### B. A new `maybeProcess<Thing>` helper

```ts
export async function maybeProcessUserTriggers(userId: string) {
  if (!(await isSchedulerEnabled())) return;
  const key = `tasks.user.lastRunAt.${userId}`;
  const windowMs = await getNumberSetting("tasks.scheduler.userWindowMs", 5 * 60_000);
  const last = await getSetting(key);
  if (last && Date.now() - Number(last) < windowMs) return;
  await setSetting(key, String(Date.now()));
  await processDueTriggersForUser(userId).catch((err) => {
    logger.error({ err, userId }, "processDueTriggersForUser failed");
  });
}
```

Three things to copy from this shape: (1) kill-switch check is first, (2) claim-window check uses `SystemSetting` not in-memory state (survives restarts), (3) the actual work is wrapped in `.catch` because the caller invokes via `void` and an unhandled rejection would crash the Node worker.

### C. External cron via GitHub Actions

```yaml
name: tasks-tick
on:
  schedule:
    - cron: "*/5 * * * *"
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf -X POST \
            -H "X-Tick-Secret: ${{ secrets.TASKS_TICK_SECRET }}" \
            https://app.example.com/api/super-admin/tasks/tick
```

Any cron service with HTTP-POST-with-headers support works the same way: cron-job.org, Cloudflare Workers Cron Triggers, an external `cron` daemon with `curl`, a Kubernetes `CronJob`. Swapping between them is a config change in the cron service, never a code change in the app.

## Related

- [`SOL-2026-002` — DB-backed operational config with .env fallback](../architecture-patterns/db-backed-config-with-env-fallback.md): establishes the `SystemSetting` table and `getSetting` / `setSetting` helpers that the kill switch and the claim-window timestamps depend on. This pattern *uses* what that doc *establishes* — read it first if you need to understand why the storage layer looks the way it does.
- [`SOL-2026-012` — Client component pulls Prisma into browser bundle](../runtime-errors/client-component-pulls-prisma-into-browser-bundle.md): same feature (tasks-and-notifications, PR #24); a build-time pitfall encountered while shipping this scheduler. Worth reading together because the scheduler's `predicates.ts` consumers were the proximate cause of that build failure.
- `src/lib/log.prune.ts` — the lazy-eval precedent this pattern generalises from; the `void maybePruneLogEntries()` call inside `writeLogEntry` is the original shape. Not yet documented in `docs/solutions/`; this doc treats it as the in-code reference.
- `src/lib/log.server.ts` — host code path for both `maybePruneLogEntries` and `maybeProcessUserTriggers`; demonstrates the two-call piggyback pattern.
- `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md` — originating plan: KTD1 (scheduler shape), KTD8 (`SystemSetting` knobs + kill switch), U6 (implementation unit).
- [PR #24](https://github.com/mr-christian-jacobsen/wl-web-app/pull/24) (merged at `63336b7`, 2026-06-01) — the implementation landing this pattern.
