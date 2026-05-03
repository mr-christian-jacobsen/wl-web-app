# CLAUDE.md

Guidance for Claude Code (and any developer) working on this repo.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind · Prisma + SQLite (default; PostgreSQL optional via docker-compose) · Auth.js (NextAuth v5, JWT sessions) · argon2id · Nodemailer · Vitest + Playwright. Package manager: pnpm.

Quick start: `pnpm install && cp .env.example .env && pnpm db:push && pnpm dev`.

## Routing: `/super-admin/*`

Anything under `/super-admin` is gated to authenticated users with `isSuperAdmin = true`. The gate is enforced in **two places** (defence-in-depth) — keep both in sync when adding new admin routes.

1. **Edge middleware** — `src/middleware.ts`
   - `PROTECTED = ["/profile", "/super-admin"]` — unauthenticated users are redirected to `/login?from=…`.
   - `SUPER_ADMIN_ONLY = ["/super-admin"]` — authenticated non-admins are redirected to `/profile`.
   - The middleware uses the edge-safe `authConfig` from `src/auth.config.ts`. **Never import `src/lib/auth.ts` from middleware** — it pulls in argon2 + Prisma and breaks the edge bundle.

2. **Server-side layout guard** — `src/app/super-admin/layout.tsx`
   - Re-checks `auth()` and `session.user.isSuperAdmin` on every request as a backstop in case the middleware matcher ever changes.
   - Also renders the shared admin nav (Overview / Users / Email templates / Usage / Back to profile).

3. **API routes** — every `/api/super-admin/**` handler must call `requireSuperAdmin()` from `src/lib/super-admin.ts` first. It returns `{ ok: true, session }` or a `NextResponse` (401/403) the handler should return directly.

### Adding a new admin page or API

- **Page**: create under `src/app/super-admin/<feature>/page.tsx`. The layout guard already runs; you don't need to re-check auth in the page itself unless you need the session object.
- **API**: create under `src/app/api/super-admin/<feature>/route.ts`. Always start the handler with `const guard = await requireSuperAdmin(); if (!guard.ok) return guard.response;`.
- **Nav link**: add it to `src/app/super-admin/layout.tsx`.
- The session JWT carries `user.isSuperAdmin` (see `src/auth.config.ts`); reading it client-side via `useSession()` is fine for showing/hiding UI hints, but it must never be the only auth check — the server still validates.

## DB normalisation: trim every string, lower-case emails

Every Prisma write is intercepted by an extension in `src/lib/db.ts` that mutates `args.data` (and `args.create` / `args.update` for upserts, and arrays for `createMany`) in place:

- **All string fields → `.trim()`**.
- **Fields named `email`, `newEmail`, `oldEmail` → trim + `.toLowerCase()`**.
- **Hash fields are skipped** (`passwordHash`, `tokenHash`, `ipHash`) — these are binary-identity values and any modification would corrupt verification.
- **Names and other strings keep their original case**. e.g. `"Hans Christian"` stays `"Hans Christian"`, never becomes `"hans christian"`.

This applies to `create`, `update`, `updateMany`, `upsert`, `createMany`. Both shorthand `{ name: "x" }` and verbose `{ name: { set: "x" } }` update forms are handled. `where` clauses are intentionally **not** touched.

### Implications when adding new fields or call sites

- You don't need to remember to call `.trim()` or `.toLowerCase()` in route handlers — the DB layer will do it. Zod validators still trim at the boundary, but that's belt-and-braces.
- If a new field should be lower-cased on write, add its name to `LOWERCASE_FIELDS` in `src/lib/db.ts`.
- If a new field stores a hash or any binary-identity value where whitespace matters, add its name to `NEVER_NORMALIZE` in `src/lib/db.ts`.
- The function `normalizeWriteData` is exported and unit-tested in `tests/unit/db-normalize.test.ts` — extend the tests when changing the rules.

## Email templates (related)

All transactional emails go through `src/lib/email.ts` and the templates in the `EmailTemplate` table. Each helper (`sendUserInvitationEmail`, `sendEmailVerificationEmail`, `sendPasswordResetEmail`, `sendEmailChangeConfirmation`) renders the admin-defined template for its key if one exists; otherwise it falls back to a built-in copy. No flow can break because of a missing template. The known keys + variables are listed in `KNOWN_TEMPLATES` (`src/lib/templates.ts`) and surfaced on `/super-admin/email-templates` so admins can see what they can override.

When substituting variables into the HTML body, values are HTML-escaped (`escapeHtml`); subject and plain-text body are not.

## Scripts

- `pnpm promote-admin <email>` — set `isSuperAdmin = true` on a user.
- `pnpm backfill-verified` — one-off after upgrading past the email-verification gate; sets `emailVerifiedAt = createdAt` for any user with `null` so pre-existing accounts can still log in.
