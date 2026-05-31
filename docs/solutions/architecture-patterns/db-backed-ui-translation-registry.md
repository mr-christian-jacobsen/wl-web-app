---
title: "DB-backed UI translation registry with boot-time sync and cached server reads"
date: 2026-05-29
id: SOL-2026-003
status: active
category: docs/solutions/architecture-patterns
module: translations
problem_type: architecture_pattern
component: service_object
severity: medium
related_components:
  - frontend_stimulus
  - database
applies_when:
  - "Moving hardcoded UI strings to per-user / per-language rendering in a Next.js App Router app"
  - "You want devs to add strings in code but let admins translate them in the DB without a separate seed step"
  - "Server components need translated strings without N duplicate DB reads per render"
tags:
  - i18n
  - translations
  - app-router
  - react-cache
  - prisma
  - instrumentation
---

# DB-backed UI translation registry with boot-time sync and cached server reads

## Context

The app started with English UI strings hardcoded directly in components. We needed
per-user language rendering (a user picks a `languageId` on `/profile`; emails and UI
should follow it) without two failure modes that usually plague homegrown i18n:

- **Drift between code and data** — a string exists in code but the DB has no row for
  it, so the UI renders blank, or the DB has a key the code no longer uses.
- **Render-time fan-out** — every server component independently querying the
  translation table, producing dozens of identical reads per page.

The chosen design is a single in-code **registry** (`src/lib/translations.ts`) as the
source of truth for *which keys exist*, paired with a DB table that holds *admin-edited
values per language*. Code owns the catalog; admins own the wording.

## Guidance

Split the system across a strict client/server boundary and let four layers cooperate:

### 1. The registry is a pure, import-safe module

`src/lib/translations.ts` exports `KNOWN_TRANSLATIONS`: an array of
`{ key, name, description?, defaultValue }`. `key` is a stable dot-separated id
(`"profile.title"`), `name`/`description` are admin-facing metadata shown in the editor,
and `defaultValue` is the English text used when no DB row resolves.

Crucially this module imports **no Prisma** — it is safe to pull into client components
and edge runtimes. The pure `translate(dict, key, params?)` helper (with `{name}`
placeholder interpolation) lives here too, so the same resolution logic runs on both
sides of the wire.

### 2. Boot-time sync reflects the registry into the DB — without clobbering admin edits

`instrumentation.ts` (the Next.js `register()` hook) dynamically imports the server
module and calls `syncTranslationKeys()` on boot. For each registry entry it:

- **Upserts** the `TranslationKey` row (name/description from code win — devs rewording
  the admin label is the intended source of truth).
- **Inserts** a default-language `Translation` row with `defaultValue` *only if one
  doesn't already exist*. Existing rows are never overwritten — once an admin types a
  value, code stops being authoritative for that locale.

The hook is guarded: it returns early on `NEXT_RUNTIME === "edge"` (no Prisma there) and
wraps the call in try/catch so a boot-time DB hiccup logs but never kills the process.

### 3. Server reads go through React `cache()` — exactly one query per render

The server engine lives in a separate `src/lib/translations.server.ts` (it pulls in
Prisma + the default-language helpers, so it must never leak into the client bundle).
`getServerTranslations()` and `getRequestLanguageId()` are wrapped in React's `cache()`,
so no matter how many layouts/pages/components ask for translations in one render tree,
the language lookup and the dictionary load each run once. `getServerT()` returns a
synchronous `t(key, params?)` ready to drop into JSX. A single `findMany` builds the
whole dictionary per language.

### 4. Client components consume a context provider

Server components serialize the resolved dictionary (a plain `Record<string, string>`)
across the boundary into `TranslationsProvider` (`src/components/TranslationsProvider.tsx`),
and client components read it via the context. Same `translate()` logic, no extra fetches.

### Resolution fallback chain (applied per key, both layers)

1. `Translation` row for the **requested** language.
2. `Translation` row for the **default** language.
3. `defaultValue` from the in-code registry.
4. **The key string itself** — deliberately visible so a missing/typo'd key screams in
   QA instead of rendering as blank text.

### Keys are editable, never deletable, from the admin UI

`/super-admin/translations` lets admins edit values but not delete keys. Deleting a key
that a live page still references would re-trigger the visible-key fallback. The registry
(code) is the only place keys are added or removed.

### A standalone sync script as a belt-and-braces path

`pnpm sync-translations` calls `syncTranslationKeys()` directly, bypassing the Next.js
`register()` hook. This covers cases where the boot hook doesn't fire: dev-mode
hot-reload occasionally skips it, CI seeds, and prod triage.

## Why This Matters

- **No drift, no seed step.** Add a key in code, ship, and it appears in the admin editor
  on the next boot. There's no migration to author and no chance of the DB lacking a row
  the code expects — the visible-key fallback guarantees something always renders.
- **Performance is bounded.** `cache()` collapses what would be O(components) reads into
  one query per language per render. The boot sync is cheap to re-run (key-only upserts +
  an existence-gated insert), so calling it opportunistically is safe.
- **Clear ownership.** Code owns the catalog and English defaults; admins own
  translations. The upsert rules encode that split so neither side stomps the other.
- **Edge-safety is preserved.** Keeping the registry Prisma-free and isolating the server
  engine in `.server.ts` means the pure module can be imported anywhere (client, edge)
  without dragging the database client into bundles that can't use it.

## When to Apply

- You're introducing per-language UI text in a Next.js App Router project and want a
  developer-friendly add-a-key-in-code workflow.
- You need admin-editable copy that survives redeploys (DB values must not be overwritten
  by code defaults).
- Many server components on one page need translations and you want to avoid duplicate
  database reads.

## Examples

Registry entry (code, source of truth for the key):

```ts
// src/lib/translations.ts
export const KNOWN_TRANSLATIONS = [
  {
    key: "profile.title",
    name: "Profile — page title",   // shown to admins in the editor
    defaultValue: "Your profile",    // English fallback
  },
  // ...
] as const;
```

Server component reading translations (one cached query per render):

```tsx
// any layout or page under src/app/...
import { getServerT } from "@/lib/translations.server";

export default async function ProfilePage() {
  const t = await getServerT();
  return <h1>{t("profile.title")}</h1>; // "Your profile" or the user's language
}
```

Boot sync — never overwrites an admin's edit:

```ts
// src/lib/translations.server.ts (inside syncTranslationKeys)
await prisma.translationKey.upsert({
  where: { key: entry.key },
  create: { key: entry.key, name: entry.name, description: entry.description ?? null },
  update: { name: entry.name, description: entry.description ?? null }, // code wins on metadata
});
// default-language value inserted ONLY if missing — existing rows are left untouched
```

## Related
- `src/lib/translations.ts` — pure registry + `translate()` helper (client-safe).
- `src/lib/translations.server.ts` — `syncTranslationKeys`, `getTranslations`, cached `getServerTranslations` / `getRequestLanguageId`, `getServerT`, `setTranslation`.
- `instrumentation.ts` — boot-time `register()` hook that runs the sync.
- `src/components/TranslationsProvider.tsx` — client context consumer.
- `pnpm sync-translations` script — fallback sync path (see CLAUDE.md > Scripts).
- Languages / default-language seeding: `src/lib/languages.ts`, `src/lib/locales.ts`.
