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

## Surveys (`/super-admin/surveys`, public `/s/[id]`)

Multi-step surveys are an admin-managed resource (global, like
`EmailTemplate` — no `userId` on `Survey`).

- **Admin CRUD** — `/super-admin/surveys` lists drafts + live surveys;
  `/super-admin/surveys/[id]` is the editor (rename, edit description,
  add/edit/delete/reorder steps, change step types, publish).
- **Step types** are defined in `src/lib/step-types.ts`. Each entry has
  an inline-SVG `icon` rendered as a tile in the picker. Choice types
  set `requiresOptions: true`; the editor surfaces the options field
  automatically and the validator + publish guard enforce ≥2 options
  before a survey can go live.
- **Publishing** — `/api/super-admin/surveys/[id]/publish` flips
  `Survey.published`. Publishing is refused when the survey has zero
  steps or any choice step has fewer than two options. `publishedAt`
  is set the first time the survey goes live and never cleared.
- **Preview vs public** — `/super-admin/surveys/[id]/preview` renders
  the same form as the public route but works regardless of
  `published`, and the form's submit is a no-op (no rows written). The
  public route `/s/[id]` returns 404 unless `published === true`.
- **Submissions** — `POST /api/surveys/[id]/responses` is unauthenticated
  but only accepts answers for published surveys. Submissions are
  validated per step (choice answers must be in `options`, `rating` is
  1–5, `yes_no` is `"yes" | "no"`, `date` is `YYYY-MM-DD`). The
  submitter IP is stored as a truncated SHA-256 hash via
  `hashIp`/`ipFromHeaders` from `src/lib/usage.ts` — there's no
  rate-limit at this layer yet.
- **Reordering** keeps the `0..N-1` `position` invariant. Both delete
  and the bulk reorder endpoint rewrite all positions in a single
  transaction. The editor uses `@dnd-kit/sortable` for drag with
  up/down arrows kept for keyboard a11y.

## Languages (`/super-admin/languages`)

Admin-managed locales — a row per `(countryCode, languageCode)` pair,
no `userId` (global, like surveys / email templates).

- **Reference data** lives in `src/lib/locales.ts` (ISO 3166-1 alpha-2
  for countries, ISO 639-1 for languages). The `COUNTRIES` array maps
  each country to its official languages; `LANGUAGES` is the
  human-readable name lookup. Both are static — extending the catalog
  means editing the file and shipping it. `isValidCountryLanguage`
  enforces that every DB row is drawn from this dataset.
- **Default row** — one seeded row, `GB-en`, with `isDefault = true`.
  `ensureDefaultLanguage` (`src/lib/languages.ts`) upserts it on every
  page load and on `GET /api/super-admin/languages`, so a fresh DB
  always shows English. The `DELETE` handler refuses any row where
  `isDefault === true` — the codes themselves aren't special, only the
  flag is. To change which `(country, language)` is the default, edit
  `DEFAULT_LANGUAGE` in `src/lib/locales.ts`.
- **Create flow** — the editor picks a country first; if the country
  has exactly one official language the picker auto-selects it,
  otherwise a second dropdown shows that country's languages only.
  `createLanguageSchema` rejects pairs not in the dataset and
  canonicalises case (`gb` → `GB`, `EN` → `en`).
- **Uniqueness** — `@@unique([countryCode, languageCode])` means the
  same locale can't be added twice. The POST handler maps Prisma's
  `P2002` to a 409.

## Email templates (related)

All transactional emails go through `src/lib/email.ts` and the templates in the `EmailTemplate` table. Each helper (`sendUserInvitationEmail`, `sendEmailVerificationEmail`, `sendPasswordResetEmail`, `sendEmailChangeConfirmation`) renders the admin-defined template for its key if one exists; otherwise it falls back to a built-in copy. No flow can break because of a missing template. The known keys + variables are listed in `KNOWN_TEMPLATES` (`src/lib/templates.ts`) and surfaced on `/super-admin/email-templates` so admins can see what they can override.

When substituting variables into the HTML body, values are HTML-escaped (`escapeHtml`); subject and plain-text body are not.

### Per-language template rows

`EmailTemplate` is keyed on `(key, languageId)` — every row belongs
to one specific Language and the same `key` may have multiple rows,
one per locale. The runtime resolver `renderTemplateByKey(key, vars,
languageId?)` (`src/lib/templates.server.ts`) walks:

1. `(key, languageId)` if a language was requested.
2. `(key, defaultLanguageId)` — always tried as the safety net; the
   default id is read lazily via `getDefaultLanguageId`, which seeds
   the row on first call.
3. Returns null → `email.ts` renders the hardcoded fallback in
   `KNOWN_TEMPLATES`.

### Per-user language preference

`User.languageId` is a nullable FK to `Language` set from
`/profile` (Language section). When an email helper is called with
`{ userId }` but no explicit `languageId`, `resolveLanguageId` in
`src/lib/email.ts` looks up the user's preference and threads it into
the template resolver — so a Danish user with `(password_reset, DK-da)`
defined will receive the Danish copy automatically while every other
user falls through to default. Callers can override by passing
`languageId` in the helper opts (useful when the user record doesn't
exist yet, e.g. some invitation flows).

`onDelete: SetNull` on the relation means deleting a non-default
language nulls the column on any user that had picked it; the user
keeps working and falls back to default.

The `EmailTemplate.language` relation is `onDelete: Restrict`; the
`/api/super-admin/languages/[id]` DELETE handler additionally checks
`_count.emailTemplates` and returns a 409 with a useful message
before letting the FK fail. To delete a non-default language, remove
its templates first. (The `User.language` relation is
`onDelete: SetNull` — users with that preference simply revert to
the default.)

## Scripts

- `pnpm promote-admin <email>` — set `isSuperAdmin = true` on a user.
- `pnpm backfill-verified` — one-off after upgrading past the email-verification gate; sets `emailVerifiedAt = createdAt` for any user with `null` so pre-existing accounts can still log in.
