---
title: Log secret-scrubber must sanitise the context field, not just message and stack
date: 2026-05-29
id: SOL-2026-008
status: active
category: docs/solutions/security-issues
module: Logging / observability (src/lib/log.server.ts)
problem_type: security_issue
component: service_object
symptoms:
  - "JWTs and API keys passed in a log entry's structured context object persisted verbatim into the LogEntry.context column"
  - "scrubSecrets ran over message and stack but not over the serialised context JSON, leaving a data-leak vector"
  - "A unit test reproduced the leak by asserting a context-borne secret survived round-trip storage"
root_cause: missing_validation
resolution_type: code_fix
severity: high
tags: [logging, secret-scrubbing, data-leak, redaction, observability]
---

# Log secret-scrubber must sanitise the context field, not just message and stack

## Problem
`writeLogEntry` in `src/lib/log.server.ts` scrubbed secrets only from the `message` and `stack` fields, but the structured `context` JSON object was serialised and stored unscrubbed. Any caller that put a JWT, Bearer token, or API key into `context` leaked that secret verbatim into the `LogEntry.context` column — a real data-exfiltration vector for anyone with read access to the logs (admins via the log viewer, anyone with DB access, anyone who later exports logs).

## Symptoms
- A JWT and an API key passed in a log entry's `context` object were written to the database unredacted, while the same secrets in `message`/`stack` were correctly masked.
- The secret-scrubber (`scrubSecrets`) was invoked for `message` and `stack` only; the path that serialised `context` to JSON skipped it entirely.
- A unit test in `tests/unit/log.test.ts` demonstrated the leak: a fake JWT and `api_key=` value placed in `context` survived storage intact.

## What Didn't Work
- Trusting callers to pre-sanitise their own `context` payloads. Logging is a fan-in choke point reached from many call sites (`logError`, `logWarning`, `logInfo`, `logServerError`, plus `instrumentation.ts:onRequestError`); a "callers must scrub" convention is unenforceable and was already silently violated. The only durable fix is to scrub centrally, at the single write boundary, over every persisted field.
- Scrubbing the raw object before serialising. Secrets can hide in nested values, array elements, and keys that a shallow object walk would miss. Running the scrubber over the *serialised* JSON string applies the same regex coverage uniformly to the entire payload regardless of nesting.

## Solution
Extend the central write path so the serialised `context` string is passed through `scrubSecrets` before truncation and storage — exactly mirroring the existing treatment of `message` and `stack`. In `src/lib/log.server.ts` the context helper now scrubs then truncates:

```ts
function stringifyContext(ctx: unknown): string | null {
  if (ctx === undefined || ctx === null) return null;
  try {
    const json = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    return truncate(scrubSecrets(json), CONTEXT_CAP);
  } catch {
    return truncate(scrubSecrets(String(ctx)), CONTEXT_CAP);
  }
}
```

Scrubbing happens *before* truncation so a token is never split mid-way (which would leak the unmasked tail past the cap). The shared scrubber (`scrubSecrets` in `src/lib/log.ts`) covers:

- JWTs — three base64url segments (`eyJ…` style), e.g. a fake `eyJEXAMPLE.eyJEXAMPLE.SIGEXAMPLE`.
- HTTP `Authorization: Bearer …` / `Token` / `Basic` headers and bare `Bearer …` tokens.
- `key=value` and JSON-style assignments for `password` / `token` / `api_key` / `secret` / `auth` / session/access/refresh tokens.
- Provider-prefixed keys (Stripe `sk_…` / `pk_…`, Resend `re_…`, GitHub `ghp_…`, AWS `AKIA…`, OpenAI `sk-…`), e.g. a fake `sk_test_EXAMPLE_NOT_REAL`.

The tests in `tests/unit/log.test.ts` now assert that all three persisted fields — `message`, `stack`, and `context` — are scrubbed independently, so a regression in any one of them fails the suite.

## Why This Works
The root cause was a missing-validation gap at a security boundary: one of the three free-form, caller-supplied fields bypassed the sanitiser. Logging is the right place to enforce redaction because it is the single fan-in point through which all error/warn/info paths flow — scrubbing here covers every current and future caller without per-call discipline. Operating on the serialised JSON (rather than walking the object) guarantees the same regex coverage reaches deeply nested values and keys. Doing it before truncation closes the secondary leak where a capped string could expose the trailing half of a token.

## Prevention
- Treat every free-form, caller-supplied field on a log entry (`message`, `stack`, `context`, and any field added later) as untrusted and route it through `scrubSecrets` at the `writeLogEntry` boundary — never rely on callers to pre-sanitise.
- When adding a new persisted log field, add a unit test in `tests/unit/log.test.ts` asserting a planted (obviously-fake) secret in that field is redacted after the write path runs. Use placeholders like `sk_test_EXAMPLE_NOT_REAL` and `eyJEXAMPLE.eyJEXAMPLE.SIGEXAMPLE` — never real-looking keys.
- Keep the `scrubSecrets` order invariant: scrub first, truncate second, so a cap can never expose an unmasked token tail.
- When introducing a new secret format (a new provider prefix, a new token shape), add a `SCRUBBERS` pattern in `src/lib/log.ts` and a matching assertion.

## Related Issues
- `src/lib/log.ts` — the shared `scrubSecrets` implementation and `SCRUBBERS` regex table; truncation caps (`MESSAGE_CAP`, `STACK_CAP`, `CONTEXT_CAP`).
- `tests/unit/log.test.ts` — per-field scrub assertions and the `scrubSecrets` regex coverage tests.
