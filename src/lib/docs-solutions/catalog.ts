/**
 * Code-owned source of truth for the `docs/solutions/` knowledge store.
 *
 * Three exports drive the validator (`src/lib/docs-solutions/validate.ts`),
 * the corpus-wide Vitest coverage test, and the `pnpm docs:fix` CLI:
 *
 *   - `KNOWN_PROBLEM_TYPES` — the full schema enum (17 values). Includes
 *     values not yet used in the current corpus so that future captures
 *     never have to extend the registry alongside their normal frontmatter
 *     change.
 *   - `KNOWN_TAGS` — every tag a doc may carry, alphabetically sorted. Seeded
 *     from the existing corpus and canonicalized: synonyms are collapsed to
 *     one form (e.g., `next-app-router` → `app-router`). Add new tags here
 *     in the same PR that introduces a doc using them.
 *   - `REQUIRED_FIELDS` — the frontmatter fields the validator treats as
 *     mandatory. The list intentionally omits `severity` for now (some
 *     existing docs do not carry it); add it back when every doc does.
 *
 * This module is **pure** — no Prisma imports, no Node-only APIs. The PR2
 * browse page imports it from a Server Component; the validator imports it
 * from a Vitest test; the autofix CLI imports it from a `.mjs` script.
 *
 * Pattern mirrors `src/lib/translations.ts`'s shape (ReadonlyArray + Map
 * lookup + accessor helpers).
 *
 * To add a tag:        append it to KNOWN_TAGS, keep the list sorted.
 * To add a problem_type: append it to KNOWN_PROBLEM_TYPES.
 * To add a required field: append it to REQUIRED_FIELDS.
 *
 * The Vitest coverage test (`tests/unit/docs-solutions-coverage.test.ts`)
 * fails CI on any drift between this registry and the on-disk corpus.
 */

// ─── Problem types ─────────────────────────────────────────────────────────
//
// All 17 enum values documented in the underlying schema. The corpus
// currently uses six of these; the other eleven are pre-registered so
// future captures don't have to extend this list alongside their normal
// frontmatter change. The coverage test's RESERVED_PROBLEM_TYPES set names
// the unused entries explicitly so orphan-warnings stay quiet at launch.

export const KNOWN_PROBLEM_TYPES = [
  // Knowledge-track
  "architecture_pattern",
  "best_practice",
  "convention",
  "design_pattern",
  "developer_experience",
  "documentation_gap",
  "tooling_decision",
  "workflow_issue",
  // Bug-track
  "build_error",
  "database_issue",
  "integration_issue",
  "logic_error",
  "performance_issue",
  "runtime_error",
  "security_issue",
  "test_failure",
  "ui_bug",
] as const satisfies ReadonlyArray<string>;

export type KnownProblemType = (typeof KNOWN_PROBLEM_TYPES)[number];

const PROBLEM_TYPE_SET: ReadonlySet<string> = new Set(KNOWN_PROBLEM_TYPES);

/** Returns true iff `value` is a registered `problem_type`. */
export function isKnownProblemType(value: string): value is KnownProblemType {
  return PROBLEM_TYPE_SET.has(value);
}

// ─── Tags ──────────────────────────────────────────────────────────────────
//
// Alphabetically sorted. Seeded from the existing corpus + canonicalized:
//   - next-app-router → app-router
//   - secret-scrubber → secret-scrubbing
// Add new tags here in the same PR that introduces a doc using them. Keep
// the list sorted so future diffs stay clean.

export const KNOWN_TAGS = [
  "404",
  "admin-ui",
  "api-documentation",
  "app-router",
  "avatars",
  "blob",
  "bundling",
  "catalog",
  "client-component",
  "configuration",
  "dark-mode",
  "data-leak",
  "drift-detection",
  "file-conventions",
  "flash-of-unstyled-content",
  "git-reset-soft",
  "git-worktree",
  "github-push-protection",
  "i18n",
  "image-upload",
  "instrumentation",
  "logging",
  "max-path",
  "nextauth",
  "nextjs",
  "nextjs-route-handler",
  "node-modules",
  "nodemailer",
  "observability",
  "openapi",
  "pnpm",
  "powershell",
  "prisma",
  "react-19",
  "react-cache",
  "react-easy-crop",
  "react-hooks",
  "redaction",
  "registry",
  "render-loop",
  "route-segment",
  "routing",
  "scalar",
  "secret-scanning",
  "secret-scrubbing",
  "secrets",
  "smtp",
  "sqlite",
  "strict-mode",
  "swagger",
  "swagger-ui-react",
  "system-settings",
  "tailwind",
  "test-fixtures",
  "theme",
  "translations",
  "use-memo",
  "vitest",
  "windows",
  "zod",
] as const satisfies ReadonlyArray<string>;

export type KnownTag = (typeof KNOWN_TAGS)[number];

const TAG_SET: ReadonlySet<string> = new Set(KNOWN_TAGS);

/** Returns true iff `tag` is a registered tag. */
export function isKnownTag(tag: string): tag is KnownTag {
  return TAG_SET.has(tag);
}

// ─── Required frontmatter fields ──────────────────────────────────────────
//
// The set of frontmatter keys the validator treats as mandatory. `severity`
// is intentionally absent — some existing docs do not carry it. Add
// `severity` here once every doc in the corpus has it. The `docs-fix.mjs`
// CLI reads this same list (via regex parse of the source text — no
// ts-node available) to know which skeleton entries to insert.

export const REQUIRED_FIELDS = [
  "title",
  "date",
  "category",
  "module",
  "problem_type",
  "id",
  "status",
] as const satisfies ReadonlyArray<string>;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

// ─── Status lifecycle ─────────────────────────────────────────────────────

export const KNOWN_STATUSES = ["active", "superseded", "archived"] as const satisfies ReadonlyArray<string>;

export type KnownStatus = (typeof KNOWN_STATUSES)[number];

const STATUS_SET: ReadonlySet<string> = new Set(KNOWN_STATUSES);

/** Returns true iff `value` is a registered status. */
export function isKnownStatus(value: string): value is KnownStatus {
  return STATUS_SET.has(value);
}

// ─── ID format ─────────────────────────────────────────────────────────────
//
// SOL-YYYY-NNN. YYYY = four-digit year of capture (matches the doc's
// `date:` year). NNN = zero-padded sequence within that year. Once
// assigned, an ID is immutable — renaming the file does not change it.

export const ID_PATTERN = /^SOL-\d{4}-\d{3}$/;

/** Returns true iff `value` matches the `SOL-YYYY-NNN` format. */
export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}
