/**
 * Shared types for the docs/solutions validator and loader.
 *
 * Kept separate from `catalog.ts` (the enum source of truth) and
 * `validate.ts` (the rule logic) so the PR2 server-only loader can
 * import just the data shapes without pulling in the validator.
 */

import type { KnownProblemType, KnownStatus, KnownTag } from "./catalog";

/** Severity is recognized but not currently required. */
export type KnownSeverity = "low" | "medium" | "high" | "critical";

/**
 * Output of `parseFrontmatter`. `frontmatter` is `null` when the
 * document has no `---` block; `error` is set when the YAML block was
 * present but failed to parse.
 */
export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
  error?: string;
}

/**
 * Frontmatter shape after validation. Fields are typed loosely because
 * the validator's job is to surface deviations, not to enforce types
 * upstream of the on-disk YAML.
 */
export interface SolutionFrontmatter {
  title?: string;
  date?: string;
  category?: string;
  module?: string;
  problem_type?: string;
  component?: string;
  severity?: string;
  id?: string;
  status?: string;
  tags?: string[];
  supersedes?: string[];
  superseded_by?: string;
  applies_when?: string[];
  symptoms?: string[];
  root_cause?: string;
  resolution_type?: string;
  related_components?: string[];
  wrong_paths_considered?: unknown;
  [key: string]: unknown;
}

/**
 * One concrete doc as scanned by `load.server.ts`. The PR2 browse page
 * consumes `SolutionDoc[]`. Path is repo-relative.
 */
export interface SolutionDoc {
  /** Repo-relative path like `docs/solutions/architecture-patterns/foo.md`. */
  path: string;
  /** Parsed frontmatter; `null` if the doc has no frontmatter block. */
  frontmatter: SolutionFrontmatter | null;
  /** Stable ID (`SOL-YYYY-NNN`) extracted from frontmatter, when present. */
  id?: string;
  /** Convenience accessors mirroring frontmatter fields. */
  title?: string;
  status?: KnownStatus;
  problemType?: KnownProblemType;
  tags?: KnownTag[];
}

/**
 * A validation issue surfaced by `validateDoc` or `validateCorpus`.
 * `severity` here is the validator's own classification (error blocks
 * CI; warning prints but does not fail), distinct from the doc's
 * frontmatter `severity:` field.
 */
export interface ValidationError {
  /** `error` fails CI; `warning` prints to stdout but does not fail. */
  severity: "error" | "warning";
  /** Repo-relative path of the offending file (or `null` for corpus-level). */
  path: string | null;
  /** Frontmatter field involved, when applicable. */
  field?: string;
  /** Human-readable message — the implementer sees this in CI output. */
  message: string;
}

/** Bag returned by per-doc validation. */
export interface ValidationResult {
  errors: ValidationError[];
}

/** Bag returned by corpus-wide validation (id-uniqueness, supersedes graph). */
export interface CorpusValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
}
