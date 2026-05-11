/**
 * Pure helpers shared by the server logger, the client logger, and the API
 * route between them. Lives outside `log.server.ts` so it can be imported
 * from client components without dragging in Prisma.
 */

export type LogLevel = "error" | "warning" | "info";
export type LogSource = "server" | "client";

export const LOG_LEVELS: readonly LogLevel[] = ["error", "warning", "info"];
export const LOG_SOURCES: readonly LogSource[] = ["server", "client"];

// Field length caps — applied at insert time so a stack-trace bomb or
// runaway context payload can't blow up the row.
export const MESSAGE_CAP = 4_096;
export const STACK_CAP = 32_768;
export const CONTEXT_CAP = 16_384;

const TRUNCATE_SUFFIX = "\n…[truncated]";

/** Truncate a string to exactly `cap` chars, appending a marker if it cut. */
export function truncate(s: string, cap: number): string {
  if (s.length <= cap) return s;
  if (cap <= TRUNCATE_SUFFIX.length) return s.slice(0, cap);
  return s.slice(0, cap - TRUNCATE_SUFFIX.length) + TRUNCATE_SUFFIX;
}

/**
 * Replace anything that looks like a credential with `[REDACTED]`. Applied to
 * messages, stacks and stringified context before persistence so a careless
 * `throw new Error(\`bad token: ${apiKey}\`)` can't leak the key into the log
 * table.
 *
 * The patterns are intentionally a little aggressive — a few false positives
 * (e.g. a long hex hash in a log message getting masked) are cheaper than one
 * leaked secret. Adjust `SCRUBBERS` below to tune.
 */
const SCRUBBERS: Array<{ re: RegExp; replace: string }> = [
  // HTTP Authorization headers
  { re: /(Authorization\s*[:=]\s*)(Bearer|Basic|Token)\s+[A-Za-z0-9._\-+/=]+/gi, replace: "$1$2 [REDACTED]" },
  { re: /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/g, replace: "Bearer [REDACTED]" },
  // key=value style: password, token, api_key, secret, auth, session
  {
    re: /\b(password|passwd|pwd|token|api[_-]?key|secret|auth|session[_-]?token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"]?([^\s'",;)}\]]+)['"]?/gi,
    replace: "$1=[REDACTED]",
  },
  // JSON-style: "password": "..."
  {
    re: /("(?:password|passwd|pwd|token|api[_-]?key|secret|auth|session[_-]?token|access[_-]?token|refresh[_-]?token)"\s*:\s*)"([^"]+)"/gi,
    replace: '$1"[REDACTED]"',
  },
  // JWT: three base64url segments separated by dots
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replace: "[REDACTED_JWT]" },
  // Provider-prefixed keys (Resend re_, Stripe sk_/pk_, GitHub ghp_/gho_, AWS AKIA, OpenAI sk-)
  { re: /\b(?:re|sk|pk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]{16,}\b/g, replace: "[REDACTED]" },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, replace: "[REDACTED]" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[REDACTED_AWS_KEY]" },
];

export function scrubSecrets(s: string): string {
  let out = s;
  for (const { re, replace } of SCRUBBERS) {
    out = out.replace(re, replace);
  }
  return out;
}

/** Strip volatile bits (line/column numbers, anonymous frame addresses) from
 * a single stack frame so the same logical bug fingerprints the same way
 * across reloads/builds. */
function normalizeFrame(frame: string): string {
  return frame
    .replace(/:\d+:\d+/g, "") // strip :line:col
    .replace(/\?[^)]*/g, "") // strip query strings inside (file?v=…)
    .replace(/0x[0-9a-f]+/gi, "0x") // strip pointer hex
    .trim();
}

/** First non-empty line of the stack that looks like a frame, normalized. */
export function topStackFrame(stack: string | null | undefined): string {
  if (!stack) return "";
  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("at ")) return normalizeFrame(trimmed);
  }
  // Fallback to the first non-empty line.
  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return normalizeFrame(trimmed);
  }
  return "";
}

/**
 * Stable identifier for a logical event. Identical events upsert onto the
 * same row, bumping `count` instead of inserting duplicates. Synchronous so
 * it's cheap to call inside the logger's hot path (Web Crypto's digest is
 * async; on Node we're using `node:crypto`'s sync API via the server logger).
 */
export function buildFingerprintInput(opts: {
  level: LogLevel;
  name: string | null | undefined;
  message: string;
  topFrame: string;
}): string {
  const msg = opts.message
    .replace(/\d+/g, "0") // collapse numeric variation (ids, timestamps)
    .trim();
  return `${opts.level}|${opts.name ?? ""}|${msg}|${opts.topFrame}`;
}
