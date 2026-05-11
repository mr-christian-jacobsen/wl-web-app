/**
 * Client-side logger. Posts to /api/log so the server can persist into the
 * same `LogEntry` table the server logger writes to. Used by:
 *   - `<ErrorReporter />` for window-level error/unhandledrejection
 *   - `app/global-error.tsx` for React render errors
 *   - any client component that catches an exception it wants on record
 */
import type { LogLevel } from "@/lib/log";

type ClientLogPayload = {
  level: LogLevel;
  name?: string | null;
  message: string;
  stack?: string | null;
  context?: unknown;
};

// Tiny in-memory dedup: same fingerprint within DEDUP_WINDOW_MS is dropped.
// Stops a flapping page from spamming the API; the server still dedups via
// the unique fingerprint, but this saves a network roundtrip.
const DEDUP_WINDOW_MS = 10_000;
const recent = new Map<string, number>();

function fingerprint(payload: ClientLogPayload): string {
  return `${payload.level}|${payload.name ?? ""}|${payload.message}`;
}

function shouldSend(fp: string): boolean {
  const now = Date.now();
  // Garbage-collect old entries opportunistically.
  for (const [k, t] of recent) {
    if (now - t > DEDUP_WINDOW_MS) recent.delete(k);
  }
  if (recent.has(fp)) return false;
  recent.set(fp, now);
  return true;
}

export async function reportClientLog(payload: ClientLogPayload): Promise<void> {
  if (typeof window === "undefined") return; // SSR no-op
  if (!shouldSend(fingerprint(payload))) return;

  const body = JSON.stringify({
    level: payload.level,
    name: payload.name ?? null,
    message: payload.message,
    stack: payload.stack ?? null,
    context: payload.context,
    url: window.location.href,
    userAgent: window.navigator.userAgent,
  });

  try {
    // sendBeacon is fire-and-forget and survives page unload — perfect for
    // logging an error that immediately precedes navigation away.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/log", blob);
      if (sent) return;
    }
    await fetch("/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch (err) {
    // Logger must never throw. Fall back to console so the dev still sees it.
    console.error("[log] failed to report client log", err);
  }
}

/** Manual error-logging helper for catch blocks in client components. */
export function logError(err: unknown, ctx?: unknown): void {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  const name = err instanceof Error ? err.name : null;
  void reportClientLog({ level: "error", name, message, stack, context: ctx });
}

export function logWarning(message: string, ctx?: unknown): void {
  void reportClientLog({ level: "warning", message, context: ctx });
}

export function logInfo(message: string, ctx?: unknown): void {
  void reportClientLog({ level: "info", message, context: ctx });
}
