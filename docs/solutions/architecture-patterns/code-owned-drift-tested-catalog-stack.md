---
id: SOL-2026-011
title: Drift-tested code-owned catalog stack (registry + Vitest validator + autofix + admin browse)
date: 2026-05-31
status: active
category: docs/solutions/architecture-patterns
module: docs-solutions
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "Adding a new in-repo registry (tag catalog, enum source, policy store, feature-flag manifest) that is code-owned but produces a human-edited surface"
  - "Enforcing schema invariants across hand-authored data files or markdown corpora without introducing runtime infrastructure"
  - "Building a read-only admin browse UI over code-owned reference data when a DB mirror is overkill"
  - "Preventing silent drift between source-of-truth constants and the downstream artifacts that cite them"
related_components:
  - testing_framework
  - documentation
  - development_workflow
tags:
  - admin-ui
  - catalog
  - drift-detection
  - registry
  - vitest
---

# Drift-tested code-owned catalog stack (registry + Vitest validator + autofix + admin browse)

## Context

The `docs/solutions/` corpus had been growing organically: ten learning docs with hand-written YAML frontmatter, no schema enforcement, no canonical tag list, and two synonym pairs (`next-app-router` / `app-router`, `secret-scrubber` / `secret-scrubbing`) already drifting apart. The repo already had strong drift-test conventions for its other code-owned surfaces — `tests/unit/openapi-coverage.test.ts` walks `src/app/api/**/route.ts` and fails CI on any miss in either direction, and `src/lib/translations.ts` exposes `KNOWN_TRANSLATIONS` as a `ReadonlyArray` with Map-based lookups — but nothing analogous protected the docs catalog. As soon as a third author landed a doc with a typo'd tag or an invented `problem_type`, the corpus would silently fragment.

The friction was specifically that the existing patterns (OpenAPI coverage, translations registry, super-admin layout guard) were each load-bearing for one surface but had never been composed together for a *new* code-owned catalog. Every ingredient existed; nobody had stitched them into a reusable shape that a future contributor could copy when adding the next registry (per-product feature flags, policy stores, lint-rule catalogs, etc.). Doing that stitch deliberately — and writing the precedent down — is what makes the next catalog land in an afternoon instead of a week.

## Guidance

The composition has four ingredients, each mirroring a precedent that has already proven itself in this repo:

1. **Pure registry module** — `src/lib/docs-solutions/catalog.ts`. Exports `KNOWN_TAGS`, `KNOWN_PROBLEM_TYPES`, `KNOWN_STATUSES`, `REQUIRED_FIELDS` as `ReadonlyArray<string>`, plus `ID_PATTERN` and type-narrowing accessors (`isKnownTag`, `isKnownProblemType`, etc.). No Prisma, no `fs`, no Node-only globals — so it imports cleanly from edge middleware, Server Components, and Vitest alike. Mirrors `src/lib/translations.ts`, which works because the same array is the single source of truth for the runtime check, the autofix script, and the admin UI.

   ```ts
   // src/lib/docs-solutions/catalog.ts
   export const KNOWN_TAGS = ["app-router", "auth", /* ... */] as const;
   export const KNOWN_PROBLEM_TYPES = ["architecture_pattern", /* ... */] as const;
   export const ID_PATTERN = /^SOL-\d{4}-\d{3}$/;
   export const isKnownTag = (s: string): s is (typeof KNOWN_TAGS)[number] =>
     (KNOWN_TAGS as readonly string[]).includes(s);
   ```

2. **Bidirectional Vitest drift test** — `tests/unit/docs-solutions-coverage.test.ts`. One `it()` asserts every doc on disk passes `validateDoc` + `validateCorpus`; a second `it()` asserts no `KNOWN_TAG` or `KNOWN_PROBLEM_TYPE` is orphaned (registered but never used) except for explicit `RESERVED_*` exclusion sets. Mirrors `tests/unit/openapi-coverage.test.ts` exactly — same `path.resolve(__dirname, "../../docs/solutions")` anchor, same `fs.readdirSync({ withFileTypes: true })` walker, same Windows-safe `/[\\/]/` path split, same `expect(arr, multi-line-msg).toEqual([])` shape so failures surface the exact rule + file. That precedent works because the message column shows the offending path inline, so a CI fail is self-explaining.

   ```ts
   // tests/unit/docs-solutions-coverage.test.ts
   it("every doc passes per-doc schema validation", () => {
     const errors = walkDocs(SOLUTIONS_ROOT).flatMap(validateDoc);
     expect(errors, errors.map(e => `${e.file}: ${e.message}`).join("\n")).toEqual([]);
   });
   it("the corpus passes catalog-level checks", () => {
     const orphans = findOrphans(corpus).filter(t => !RESERVED_PROBLEM_TYPES.has(t));
     expect(orphans, `orphan: ${orphans.join(", ")}`).toEqual([]);
   });
   ```

3. **Autofix CLI** — `scripts/docs-fix.mjs`, invoked via `pnpm docs:fix`. ESM `.mjs` with a shebang, top-level `await`, `readFileSync` of `catalog.ts` parsed by regex to pull out `REQUIRED_FIELDS` (no `tsx` / `ts-node` in devDeps). Idempotent on a clean corpus — re-running produces zero changes. Mirrors `scripts/sync-translations.mjs`, which works because the harness has zero runtime dependencies beyond Node itself and can run in CI, in a dev shell, or as a pre-commit hook without setup.

4. **Admin browse page** *(optional, layer on later)* — `src/app/super-admin/docs-solutions/page.tsx`. Server Component reads `docs/solutions/` live through `src/lib/docs-solutions/load.server.ts`, which wraps the walker in `React.cache()` so one render does one disk scan. No DB mirror, no embeddings, no client search index — filtering is client-side over the prefetched typed array (fine under ~100 items). Auth is the layout guard from `/super-admin/*`, not a page-level `requireSuperAdmin()` (that one's only for API routes, per CLAUDE.md). Mirrors `src/lib/translations.server.ts` (cache-wrapped pure-registry reader) and `src/app/super-admin/languages/page.tsx` (admin Server-Component shell).

## Why This Matters

When this composition is applied to a new catalog, three things happen automatically:

- **The catalog becomes self-healing at write time.** The validator + autofix pair means a contributor who hand-edits a doc and forgets `status` gets it filled in by `pnpm docs:fix`; if they ship without running it, the bidirectional drift test fails CI with the exact file path and rule name. Future LLMs reading the corpus can trust the schema. This is the first load-bearing payoff: the catalog can't silently drift.
- **The drift test feels familiar to reviewers.** Because `docs-solutions-coverage.test.ts` is structurally identical to `openapi-coverage.test.ts` (same walker, same `toEqual([])` shape, same `RESERVED_*` exclusion convention), a reviewer who has worked on either one does not have to context-switch — they read the failure the same way. This is the second load-bearing payoff: convention-matching keeps the cognitive cost of a new drift test near zero, which is what makes the pattern actually get reused.
- **The composition scales down.** A new registry that doesn't need an admin UI can skip step 4 entirely. A registry whose source of truth is already in the database can swap `load.server.ts` for a Prisma query and keep the rest. The pure-registry + drift-test + autofix triad is the irreducible core.

When this composition isn't applied — the typical failure mode is what `docs/solutions/` looked like a week ago: tag synonyms drifting, no canonical enum list, schema enforced only by `git blame`-driven review, and any structural improvement (adding a status lifecycle, a browse UI, a query tool) gated on first cleaning up the corpus by hand. The plan-stage doc review caught three P0 findings on this work alone (a wrongly-required `severity` field, a category-prefix bug, an AE1 wording contradiction) before they hit CI — that same review reflex doesn't exist for an ad-hoc catalog with no schema.

## When to Apply

- The catalog is **code-owned but human-edited** — enums and tags are decided in code, but titles, prose, and decisions are written by humans (docs, policy stores, lint catalogs, feature-flag manifests).
- The corpus is **under ~100 items** at steady state, or growth is slow enough that a client-side filter over a prefetched array remains acceptable. Past that, swap the browse UI for a paginated server-driven list (the registry + drift test + autofix stay).
- The on-disk format has **stable required fields** that can be expressed as a literal `REQUIRED_FIELDS` array. If the schema is rapidly evolving, write the validator first and add the autofix only once the shape settles.
- The repo already has at least one drift-tested surface to mirror. Convention-matching is the multiplier; if there is no in-repo precedent, build one of those first (start with the validator + test, skip the autofix and admin UI).
- **Overkill when**: the catalog is fully DB-backed (Prisma + admin CRUD already enforce schema); the corpus has under ~5 items and is touched once a quarter; or the registry is a true black-box dependency where there is nothing to validate against.

## Examples

**Registry module shape** (`src/lib/docs-solutions/catalog.ts`):

```ts
export const KNOWN_TAGS = ["app-router", "auth", "prisma", /* ... 48 more */] as const;
export const KNOWN_PROBLEM_TYPES = [
  "architecture_pattern", "bug", "performance", /* ... 14 more */,
] as const;
export const KNOWN_STATUSES = ["active", "superseded", "archived"] as const;
export const REQUIRED_FIELDS = [
  "title", "date", "category", "module", "problem_type", "id", "status",
] as const;
export const ID_PATTERN = /^SOL-\d{4}-\d{3}$/;
export const isKnownTag = (s: string): s is (typeof KNOWN_TAGS)[number] =>
  (KNOWN_TAGS as readonly string[]).includes(s);
export const isValidId = (s: string) => ID_PATTERN.test(s);
```

**Bidirectional Vitest test** (`tests/unit/docs-solutions-coverage.test.ts`):

```ts
const SOLUTIONS_ROOT = path.resolve(__dirname, "../../docs/solutions");
const RESERVED_PROBLEM_TYPES = new Set(["future_pattern_1", /* ... */]);

it("every doc on disk passes validateDoc + validateCorpus", () => {
  const docs = walkSync(SOLUTIONS_ROOT).map(parseFrontmatter);
  const errors = [...docs.flatMap(validateDoc), ...validateCorpus(docs)];
  expect(
    errors,
    errors.map(e => `${e.file}: ${e.rule} - ${e.message}`).join("\n"),
  ).toEqual([]);
});

it("no orphan KNOWN_PROBLEM_TYPES (except RESERVED_*)", () => {
  const used = new Set(docs.map(d => d.problem_type));
  const orphans = KNOWN_PROBLEM_TYPES
    .filter(t => !used.has(t) && !RESERVED_PROBLEM_TYPES.has(t));
  expect(orphans, `orphan: ${orphans.join(", ")}`).toEqual([]);
});
```

**Autofix CLI invocation**:

```bash
pnpm docs:fix                     # idempotent; zero diff on clean corpus
pnpm docs:fix && pnpm test        # autofix-then-verify before commit
```

The script (`scripts/docs-fix.mjs`) parses `REQUIRED_FIELDS` straight out of `catalog.ts` via regex — no `tsx` / `ts-node` in devDeps — and writes back YAML with `yaml` (eemeli). Same harness shape as `scripts/sync-translations.mjs`.

**Admin browse data flow**:

```
src/app/super-admin/docs-solutions/page.tsx        (Server Component)
  └─> src/lib/docs-solutions/load.server.ts        (React.cache + realpathSync guard)
        └─> walks docs/solutions/, parseFrontmatter → SolutionDoc[]
  └─> hands SolutionRow[] to:
       src/components/super-admin/DocsSolutionsList.tsx   ("use client")
         └─> problem_type select, status select, tag chips (AND-match)
         └─> Clear-tags button, result count, empty state inline
```

Auth comes from the `/super-admin/*` layout guard — the page itself does not call `requireSuperAdmin()` (a comment in the file records the rationale, since CLAUDE.md routes that helper to API handlers only). `GITHUB_REPO_URL` is read in `load.server.ts`, validated to start with `https://`, and pre-composed into source URLs server-side — the client bundle never sees the env var.

**Key files in this implementation**:

- `src/lib/docs-solutions/catalog.ts`
- `src/lib/docs-solutions/types.ts`
- `src/lib/docs-solutions/validate.ts`
- `src/lib/docs-solutions/load.server.ts`
- `tests/unit/docs-solutions-coverage.test.ts`
- `tests/unit/docs-solutions-validate.test.ts`
- `scripts/docs-fix.mjs`
- `src/app/super-admin/docs-solutions/page.tsx`
- `src/components/super-admin/DocsSolutionsList.tsx`

**Precedents this composition mirrors**:

- `tests/unit/openapi-coverage.test.ts` — bidirectional drift-test shape.
- `src/lib/translations.ts` + `src/lib/translations.server.ts` — pure registry + cache-wrapped server reader.
- `src/lib/openapi/` — multi-file feature-folder composition.
- `src/app/super-admin/languages/page.tsx` — admin Server-Component shell.
- `scripts/sync-translations.mjs` — `.mjs` script harness.

## Related

- `docs/solutions/architecture-patterns/openapi-spec-from-zod-validators.md` (SOL-2026-004) — the drift-test shape this pattern's validator layer mirrors (bidirectional set-compare, `expect(arr, msg).toEqual([])`, explicit excludes). This composition generalizes the OpenAPI doc's pattern to an arbitrary on-disk surface.
- `docs/solutions/architecture-patterns/db-backed-ui-translation-registry.md` (SOL-2026-003) — the pure-registry + `.server.ts` + `cache()` shape this pattern's registry and browse layers mirror. The two docs are siblings: translations applies the catalog pattern to DB rows, this doc applies it to on-disk frontmatter files.
- Shipped in two PRs: PR #21 (PR1 — validator + catalog + autofix + backfill) and PR #22 (PR2 — admin browse page).
