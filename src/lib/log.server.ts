import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import {
  CONTEXT_CAP,
  type LogLevel,
  type LogSource,
  MESSAGE_CAP,
  STACK_CAP,
  buildFingerprintInput,
  scrubSecrets,
  topStackFrame,
  truncate,
} from "@/lib/log";
import { maybePruneLogEntries } from "@/lib/log.prune";
import { maybeProcessUserTriggers } from "@/lib/scheduler";

type RequestContext = {
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
};

type ClientContext = {
  url?: string | null;
  userAgent?: string | null;
};

type LogInput = {
  level: LogLevel;
  source: LogSource;
  name?: string | null;
  message: string;
  stack?: string | null;
  context?: unknown;
  userId?: string | null;
} & RequestContext &
  ClientContext;

/**
 * Persist a log entry, deduplicating against the unique `fingerprint`. The
 * logger itself MUST NOT throw — a failure here would lose the original
 * error and inject a confusing one. We catch + console-fall-back instead.
 */
export async function writeLogEntry(input: LogInput): Promise<void> {
  try {
    // Scrub before truncate so we never split a token mid-way and leak the
    // unmasked tail. Stacks, messages and context are all suspect — the name
    // field is just an Error class name and never carries secrets.
    const message = truncate(scrubSecrets(input.message), MESSAGE_CAP);
    const stack = input.stack ? truncate(scrubSecrets(input.stack), STACK_CAP) : null;
    const context = stringifyContext(input.context);
    const fingerprint = createHash("sha256")
      .update(
        buildFingerprintInput({
          level: input.level,
          name: input.name ?? null,
          message,
          topFrame: topStackFrame(stack),
        }),
      )
      .digest("hex");

    // Best-effort link to the user's most recent active UsageSession so the
    // detail modal can surface OS / browser / device. Cheap (one indexed
    // lookup); a miss just leaves sessionId null.
    const sessionId = input.userId ? await findRecentSessionId(input.userId) : null;

    await prisma.logEntry.upsert({
      where: { fingerprint },
      create: {
        level: input.level,
        source: input.source,
        fingerprint,
        name: input.name ?? null,
        message,
        stack,
        context,
        method: input.method ?? null,
        path: input.path ?? null,
        statusCode: input.statusCode ?? null,
        url: input.url ?? null,
        userAgent: input.userAgent ?? null,
        userId: input.userId ?? null,
        sessionId,
      },
      update: {
        count: { increment: 1 },
        // Refresh the latest sample of variable fields so the modal shows
        // the most recent occurrence's details.
        message,
        stack,
        context,
        method: input.method ?? null,
        path: input.path ?? null,
        statusCode: input.statusCode ?? null,
        url: input.url ?? null,
        userAgent: input.userAgent ?? null,
        userId: input.userId ?? null,
        sessionId,
      },
    });
  } catch (err) {
    console.error("[log] failed to persist log entry", err, {
      original: input.message,
    });
  }

  // Opportunistic retention pass — fire-and-forget, doesn't block the caller.
  // Internally rate-limited to once per 24h via the `log.lastPrunedAt`
  // SystemSetting so high-write paths don't keep repeating it.
  void maybePruneLogEntries();

  // Opportunistic per-user tasks-scheduler hook (U6 / KTD1). Mirrors the
  // log-prune fire-and-forget pattern: internally rate-limited to once
  // per `tasks.scheduler.userWindowMs` (default 5 min) via the
  // `tasks.user.lastRunAt.<userId>` SystemSetting. Two important guards:
  //   - Only fire when we know the userId — anonymous client log entries
  //     don't carry one and there's no user to schedule against.
  //   - Errors are swallowed inside `maybeProcessUserTriggers`; this
  //     call is intentionally not awaited so a stuck scheduler can't
  //     block the log write.
  if (input.userId) {
    void maybeProcessUserTriggers(input.userId);
  }
}

/**
 * Look up the user's most recent UsageSession. Uses the existing
 * (userId, lastActiveAt) index; ignores sessions that haven't been touched
 * in the last 24h to avoid attributing a new error to a long-stale tab.
 */
async function findRecentSessionId(userId: string): Promise<string | null> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const session = await prisma.usageSession.findFirst({
      where: { userId, lastActiveAt: { gte: since } },
      orderBy: { lastActiveAt: "desc" },
      select: { id: true },
    });
    return session?.id ?? null;
  } catch {
    return null;
  }
}

function stringifyContext(ctx: unknown): string | null {
  if (ctx === undefined || ctx === null) return null;
  try {
    const json = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    return truncate(scrubSecrets(json), CONTEXT_CAP);
  } catch {
    return truncate(scrubSecrets(String(ctx)), CONTEXT_CAP);
  }
}

function extractFromError(err: unknown): { name: string | null; message: string; stack: string | null } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack ?? null };
  }
  return { name: null, message: typeof err === "string" ? err : safeJson(err), stack: null };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Manual error logger for server code that catches an exception. */
export async function logError(
  err: unknown,
  ctx?: { context?: unknown; userId?: string | null } & RequestContext,
): Promise<void> {
  const { name, message, stack } = extractFromError(err);
  await writeLogEntry({
    level: "error",
    source: "server",
    name,
    message,
    stack,
    context: ctx?.context,
    userId: ctx?.userId,
    method: ctx?.method,
    path: ctx?.path,
    statusCode: ctx?.statusCode,
  });
}

export async function logWarning(
  message: string,
  ctx?: { context?: unknown; userId?: string | null; cause?: unknown },
): Promise<void> {
  // If a cause was supplied (typically a caught error that we recovered from),
  // attach its stack so the warning is debuggable.
  const causeInfo = ctx?.cause ? extractFromError(ctx.cause) : { name: null, stack: null };
  await writeLogEntry({
    level: "warning",
    source: "server",
    name: causeInfo.name,
    message,
    stack: causeInfo.stack,
    context: ctx?.context,
    userId: ctx?.userId,
  });
}

export async function logInfo(
  message: string,
  ctx?: { context?: unknown; userId?: string | null },
): Promise<void> {
  await writeLogEntry({
    level: "info",
    source: "server",
    message,
    context: ctx?.context,
    userId: ctx?.userId,
  });
}

/** Entry point used by `instrumentation.ts:onRequestError`. */
export async function logServerError(
  err: unknown,
  request: { method?: string; path?: string; routePath?: string },
): Promise<void> {
  const { name, message, stack } = extractFromError(err);
  await writeLogEntry({
    level: "error",
    source: "server",
    name,
    message,
    stack,
    method: request.method ?? null,
    path: request.path ?? request.routePath ?? null,
  });
}
