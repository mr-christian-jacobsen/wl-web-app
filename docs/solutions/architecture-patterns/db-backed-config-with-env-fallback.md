---
title: DB-backed operational config with .env fallback and per-send rebuild
date: 2026-05-29
category: docs/solutions/architecture-patterns
module: System settings / email
problem_type: architecture_pattern
component: service_object
severity: medium
applies_when:
  - "Operational config (SMTP, retention, provider API keys) needs to change without a redeploy or restart"
  - "Admins need a UI to edit settings that previously lived only in .env"
  - "A setting is a secret and must never be echoed back to the client"
  - "A consumer caches a connection/transport built from config and must pick up changes immediately"
tags:
  - system-settings
  - smtp
  - configuration
  - secrets
  - nodemailer
  - prisma
---

# DB-backed operational config with .env fallback and per-send rebuild

## Context

SMTP credentials originally lived only in `.env`. Changing them meant editing
the environment and restarting the process, and there was no admin-facing way
to update them live. Operational config that an admin should reasonably be able
to change (mail server, log-retention window, translation-provider keys)
doesn't belong behind a deploy. The challenge is supporting runtime edits
without giving up the convenience of `.env` for local dev and first boot, and
without leaking secrets back to the browser.

## Guidance

Use a **generic key/value settings table as the primary source, with `.env`
as the fallback** ("DB-first, env-fallback"). Three rules make the pattern
safe and reusable:

1. **One generic table, not a column-per-setting.** A single
   `SystemSetting { key @id, value String?, isSecret Boolean, ... }` row per
   setting. Adding a new operational knob is a new row, not a migration. This
   repo's table is exactly that (`prisma/schema.prisma`):

   ```prisma
   model SystemSetting {
     key       String   @id
     value     String?
     // When true, the value is masked in API responses; updates only apply
     // when a non-empty replacement is supplied.
     isSecret  Boolean  @default(false)
     updatedAt DateTime @updatedAt
     createdAt DateTime @default(now())
   }
   ```

2. **Resolve at the point of use, every time** — don't cache the resolved
   config at module load. `buildTransporter()` in `src/lib/email.ts` reads the
   current SMTP settings (DB > env) and builds a one-shot Nodemailer transport
   on **every send call**. An admin who saves new settings sees them take
   effect on the next email — no restart, no cache bust. When neither DB nor
   env yields a usable config, the helper degrades gracefully (console-logs the
   message instead of throwing).

   ```ts
   // DB value wins; fall back to env; rebuild fresh each call.
   const host = (await getSetting("smtp.host")) ?? process.env.SMTP_HOST;
   // ... build nodemailer.createTransport(...) here, per send.
   ```

3. **Never round-trip secrets.** The settings API returns a `hasPassword`
   boolean instead of the SMTP password value. The client knows whether a
   password is set, but the secret never leaves the server. Writes only apply a
   secret when a non-empty replacement is supplied, so saving the form without
   re-typing the password leaves the stored secret untouched.

Close the loop with a **"Send test email"** action on the settings page
(`/super-admin/system-settings`) so an admin can verify a saved config end to
end without waiting for a real transactional email.

## Why This Matters

- **No deploy for ops changes.** Rotating SMTP creds or pointing at a new mail
  relay is a form save, not a release.
- **Immediate effect.** Resolving per-call (rather than at boot) removes the
  whole class of "I changed the setting but it's still using the old value"
  confusion that comes with cached config.
- **Local dev stays frictionless.** `.env` still works out of the box; the DB
  only overrides when a row exists, so a fresh clone needs no admin setup.
- **Secrets stay server-side.** Exposing only `hasPassword` means the admin UI
  never holds the real credential, and a no-op save can't accidentally blank it.
- **Reusable.** Because the table is generic, the same mechanism later absorbed
  log-retention config and translation-provider API keys with zero schema
  churn — proving the pattern generalises across operational settings.

## When to Apply

- An operational value should be editable by an admin without a redeploy.
- You want `.env` to remain the default/dev source while the DB can override.
- The value is sensitive and must be masked in API responses.
- A downstream consumer (transport, client, connection) is built from the
  config and must reflect edits without a process restart.

Do **not** use this for values that are part of the deployment contract
(database URL, auth secret/JWT signing key, build-time flags) — those should
stay in `.env`/secret storage and changing them legitimately warrants a deploy.

## Examples

Before — config bound once at startup, no admin path:

```ts
// Module-level transport, frozen at import time.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  // ...
});
// Changing SMTP_* requires editing .env and restarting the process.
```

After — DB-first resolution rebuilt per send, with graceful fallback:

```ts
// src/lib/email.ts — built fresh on each send call (DB > env).
async function buildTransporter() {
  const host = (await getSetting("smtp.host")) ?? process.env.SMTP_HOST;
  // ...resolve user/pass/port the same way...
  if (!host) return { transporter: null, from }; // -> console-log fallback
  return { transporter: nodemailer.createTransport({ host, /* ... */ }), from };
}
```

Secret handling at the API boundary:

```ts
// Response shape: the value is never sent, only whether one exists.
return Response.json({ smtp: { host, user, hasPassword: Boolean(password) } });

// On write: only overwrite the secret when a real replacement is provided.
if (input.password && input.password.length > 0) {
  await setSetting("smtp.password", input.password, { isSecret: true });
}
```

## Related

- `src/lib/email.ts` — `buildTransporter()` (per-send DB > env resolution) and
  the test-email helper.
- `src/lib/system-settings.ts` — get/set helpers over the `SystemSetting` table.
- `src/components/super-admin/SmtpSettingsForm.tsx` and
  `src/app/super-admin/system-settings/page.tsx` — admin UI + "Send test email".
- `src/lib/log.server.ts`, `src/lib/translate-provider.ts` — later reuses of
  the same generic settings table.
- `prisma/schema.prisma` — `model SystemSetting`.
