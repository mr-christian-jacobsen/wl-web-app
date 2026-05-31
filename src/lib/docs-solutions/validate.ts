/**
 * Frontmatter validator for `docs/solutions/`.
 *
 * Pure functions — no filesystem access, no `process.cwd()`. The
 * Vitest coverage test (`tests/unit/docs-solutions-coverage.test.ts`)
 * wraps these in a corpus walk; the `pnpm docs:fix` CLI re-uses
 * `parseFrontmatter` and the field-required set; the PR2 server loader
 * wraps `parseFrontmatter` in a request-time scan.
 *
 * Errors fail CI (the coverage test asserts `errors === []`). Warnings
 * print but do not fail — they exist for advisory drift signals like
 * "this registry entry is unused in any doc."
 */

import { parse as parseYaml } from "yaml";

import {
  ID_PATTERN,
  KNOWN_PROBLEM_TYPES,
  KNOWN_STATUSES,
  KNOWN_TAGS,
  REQUIRED_FIELDS,
} from "./catalog";
import type {
  CorpusValidationResult,
  ParsedFrontmatter,
  SolutionFrontmatter,
  ValidationError,
  ValidationResult,
} from "./types";

// ─── Frontmatter parser ────────────────────────────────────────────────────

/**
 * Splits a markdown source on the `---\n...\n---\n` frontmatter block,
 * runs `yaml.parse` on the matter, returns body separately.
 *
 *   - No `---` header  → `{ frontmatter: null, body: source }`
 *   - Malformed YAML   → `{ frontmatter: null, body, error: <message> }`
 *   - Valid frontmatter → `{ frontmatter, body }`
 */
export function parseFrontmatter(source: string): ParsedFrontmatter {
  // Strip BOM if present so the regex anchor matches.
  const text = source.replace(/^﻿/, "");

  // Must start with --- on its own line. Capture matter up to the next
  // --- line, then everything after.
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) {
    return { frontmatter: null, body: text };
  }

  // Regex `match` carries `string | undefined` for capture groups under
  // strict mode; the groups are guaranteed when the exec succeeded.
  const matter = match[1] ?? "";
  const body = match[2] ?? "";
  try {
    const parsed = parseYaml(matter);
    if (parsed === null || parsed === undefined) {
      return { frontmatter: null, body };
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        frontmatter: null,
        body,
        error: "frontmatter must be a YAML mapping (key/value pairs)",
      };
    }
    return { frontmatter: parsed as Record<string, unknown>, body };
  } catch (err) {
    return {
      frontmatter: null,
      body,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Per-doc validation ────────────────────────────────────────────────────

/**
 * Validates one doc against the schema. `repoRelativePath` is required
 * so error messages name the offending file and so the category-vs-
 * directory check has something to compare against. `allIds` is the
 * set of every `id` present in the corpus — used to validate
 * `supersedes` / `superseded_by` reference existence.
 *
 * Caller responsibility: pass `repoRelativePath` with forward slashes
 * (Windows backslashes must be normalised before calling, otherwise the
 * category-directory check produces false errors).
 */
export function validateDoc(
  parsed: ParsedFrontmatter,
  repoRelativePath: string,
  allIds: ReadonlySet<string>,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (parsed.error) {
    errors.push({
      severity: "error",
      path: repoRelativePath,
      message: `frontmatter YAML failed to parse: ${parsed.error}`,
    });
    return { errors };
  }

  const fm = (parsed.frontmatter ?? {}) as SolutionFrontmatter;

  // R2: Required field presence.
  for (const field of REQUIRED_FIELDS) {
    const value = fm[field];
    if (value === undefined || value === null || value === "") {
      errors.push({
        severity: "error",
        path: repoRelativePath,
        field,
        message: `missing required frontmatter field: ${field}`,
      });
    }
  }

  // R2: problem_type enum membership.
  if (typeof fm.problem_type === "string" && fm.problem_type !== "") {
    if (!KNOWN_PROBLEM_TYPES.includes(fm.problem_type as never)) {
      errors.push({
        severity: "error",
        path: repoRelativePath,
        field: "problem_type",
        message: `problem_type '${fm.problem_type}' is not in KNOWN_PROBLEM_TYPES (add to src/lib/docs-solutions/catalog.ts)`,
      });
    }
  }

  // R8: id format (SOL-YYYY-NNN).
  if (typeof fm.id === "string" && fm.id !== "") {
    if (!ID_PATTERN.test(fm.id)) {
      errors.push({
        severity: "error",
        path: repoRelativePath,
        field: "id",
        message: `id '${fm.id}' does not match SOL-YYYY-NNN format`,
      });
    }
  }

  // R8: status enum.
  if (typeof fm.status === "string" && fm.status !== "") {
    if (!KNOWN_STATUSES.includes(fm.status as never)) {
      errors.push({
        severity: "error",
        path: repoRelativePath,
        field: "status",
        message: `status '${fm.status}' is not one of ${KNOWN_STATUSES.join(" | ")}`,
      });
    }
  }

  // R2: category must match the file's containing directory. Compared
  // against the full `docs/solutions/<dir>` prefix to match how the
  // corpus stores `category:` today (F-002 resolution).
  if (typeof fm.category === "string" && fm.category !== "") {
    const expected = expectedCategory(repoRelativePath);
    if (expected !== null && fm.category !== expected) {
      errors.push({
        severity: "error",
        path: repoRelativePath,
        field: "category",
        message: `category '${fm.category}' does not match the file's directory ('${expected}')`,
      });
    }
  }

  // R3 (KTD4 strict-binary): every tag must be in KNOWN_TAGS.
  if (Array.isArray(fm.tags)) {
    for (const tag of fm.tags) {
      if (typeof tag !== "string") {
        errors.push({
          severity: "error",
          path: repoRelativePath,
          field: "tags",
          message: `tags must be strings, got: ${typeof tag}`,
        });
        continue;
      }
      if (!KNOWN_TAGS.includes(tag as never)) {
        errors.push({
          severity: "error",
          path: repoRelativePath,
          field: "tags",
          message: `tag '${tag}' is not in KNOWN_TAGS (add to src/lib/docs-solutions/catalog.ts in the same PR)`,
        });
      }
    }
  }

  // R2: supersedes target existence.
  if (Array.isArray(fm.supersedes)) {
    for (const target of fm.supersedes) {
      if (typeof target !== "string") continue;
      if (!allIds.has(target)) {
        errors.push({
          severity: "error",
          path: repoRelativePath,
          field: "supersedes",
          message: `supersedes references unknown id '${target}'`,
        });
      }
    }
  }

  // R2: superseded_by target existence.
  if (typeof fm.superseded_by === "string" && fm.superseded_by !== "") {
    if (!allIds.has(fm.superseded_by)) {
      errors.push({
        severity: "error",
        path: repoRelativePath,
        field: "superseded_by",
        message: `superseded_by references unknown id '${fm.superseded_by}'`,
      });
    }
  }

  return { errors };
}

/**
 * Derives the expected `category:` value from a doc's repo-relative
 * path. For `docs/solutions/architecture-patterns/foo.md` the expected
 * value is `docs/solutions/architecture-patterns`. Returns `null` when
 * the path is not under `docs/solutions/`.
 *
 * Expects forward-slash paths; caller normalises Windows backslashes
 * before invoking.
 */
export function expectedCategory(repoRelativePath: string): string | null {
  const parts = repoRelativePath.split("/");
  // Need at least docs/solutions/<dir>/<file.md>.
  if (parts.length < 4) return null;
  if (parts[0] !== "docs" || parts[1] !== "solutions") return null;
  return `docs/solutions/${parts[2]}`;
}

// ─── Corpus-wide validation ────────────────────────────────────────────────

export interface CorpusInput {
  path: string;
  parsed: ParsedFrontmatter;
}

/**
 * Corpus-level checks that span multiple docs: id uniqueness,
 * supersedes / superseded_by mutual consistency, supersedes graph
 * acyclic, status ↔ superseded_by consistency, orphan registry-entry
 * warnings.
 *
 * `reservedProblemTypes` and `reservedTags` are sets of entries that
 * are known to be pre-registered for future use and should not produce
 * orphan-warnings even when no current doc uses them. The Vitest
 * coverage test passes the launch sets; tests can pass empty sets to
 * exercise the orphan-warning path directly.
 */
export function validateCorpus(
  docs: ReadonlyArray<CorpusInput>,
  options: {
    reservedProblemTypes?: ReadonlySet<string>;
    reservedTags?: ReadonlySet<string>;
  } = {},
): CorpusValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const reservedPT = options.reservedProblemTypes ?? new Set<string>();
  const reservedTags = options.reservedTags ?? new Set<string>();

  // Index docs by id for cycle / mutual-reference checks.
  const byId = new Map<string, CorpusInput>();
  const dupIds = new Map<string, string[]>(); // id → list of paths

  for (const doc of docs) {
    const fm = (doc.parsed.frontmatter ?? {}) as SolutionFrontmatter;
    if (typeof fm.id !== "string" || fm.id === "") continue;

    const existing = byId.get(fm.id);
    if (existing) {
      const list = dupIds.get(fm.id) ?? [existing.path];
      list.push(doc.path);
      dupIds.set(fm.id, list);
    } else {
      byId.set(fm.id, doc);
    }
  }

  // Duplicate ID errors.
  for (const [id, paths] of dupIds) {
    errors.push({
      severity: "error",
      path: null,
      field: "id",
      message: `duplicate id '${id}' on ${paths.length} docs: ${paths.join(", ")}`,
    });
  }

  // supersedes / superseded_by mutual consistency.
  for (const doc of docs) {
    const fm = (doc.parsed.frontmatter ?? {}) as SolutionFrontmatter;

    // If A.superseded_by = B then B.supersedes must include A.
    if (typeof fm.superseded_by === "string" && fm.superseded_by !== "" && typeof fm.id === "string") {
      const target = byId.get(fm.superseded_by);
      if (target) {
        const tfm = (target.parsed.frontmatter ?? {}) as SolutionFrontmatter;
        const supersedes = Array.isArray(tfm.supersedes) ? tfm.supersedes : [];
        if (!supersedes.includes(fm.id)) {
          errors.push({
            severity: "error",
            path: doc.path,
            field: "superseded_by",
            message: `superseded_by ${fm.superseded_by} but target (${target.path}) does not list '${fm.id}' in supersedes`,
          });
        }
      }
    }

    // If A.supersedes includes B then B.superseded_by must equal A.
    if (Array.isArray(fm.supersedes) && typeof fm.id === "string") {
      for (const targetId of fm.supersedes) {
        if (typeof targetId !== "string") continue;
        const target = byId.get(targetId);
        if (!target) continue; // missing-target error already raised per-doc
        const tfm = (target.parsed.frontmatter ?? {}) as SolutionFrontmatter;
        if (tfm.superseded_by !== fm.id) {
          errors.push({
            severity: "error",
            path: doc.path,
            field: "supersedes",
            message: `supersedes ${targetId} but target (${target.path}) does not declare superseded_by '${fm.id}'`,
          });
        }
      }
    }

    // Orphan superseded state: status: superseded but no other doc points at us.
    if (fm.status === "superseded" && typeof fm.id === "string") {
      const claimedBy = docs.some((other) => {
        const ofm = (other.parsed.frontmatter ?? {}) as SolutionFrontmatter;
        if (!Array.isArray(ofm.supersedes)) return false;
        return ofm.supersedes.includes(fm.id!);
      });
      if (!claimedBy) {
        errors.push({
          severity: "error",
          path: doc.path,
          field: "status",
          message: `status: superseded but no other doc lists '${fm.id}' in its supersedes array`,
        });
      }
    }
  }

  // supersedes graph acyclic — walk superseded_by chains looking for cycles.
  for (const start of byId.values()) {
    const startFm = (start.parsed.frontmatter ?? {}) as SolutionFrontmatter;
    if (typeof startFm.id !== "string") continue;

    const visited = new Set<string>();
    let cursorId: string | undefined = startFm.id;
    while (cursorId !== undefined) {
      if (visited.has(cursorId)) {
        errors.push({
          severity: "error",
          path: null,
          field: "superseded_by",
          message: `supersedes cycle detected starting at ${startFm.id}: ${[...visited, cursorId].join(" → ")}`,
        });
        break;
      }
      visited.add(cursorId);
      const node = byId.get(cursorId);
      if (!node) break;
      const fm = (node.parsed.frontmatter ?? {}) as SolutionFrontmatter;
      cursorId = typeof fm.superseded_by === "string" ? fm.superseded_by : undefined;
    }
  }

  // Orphan registry entries — warnings only.
  const usedProblemTypes = new Set<string>();
  const usedTags = new Set<string>();
  for (const doc of docs) {
    const fm = (doc.parsed.frontmatter ?? {}) as SolutionFrontmatter;
    if (typeof fm.problem_type === "string") usedProblemTypes.add(fm.problem_type);
    if (Array.isArray(fm.tags)) {
      for (const tag of fm.tags) {
        if (typeof tag === "string") usedTags.add(tag);
      }
    }
  }

  for (const pt of KNOWN_PROBLEM_TYPES) {
    if (!usedProblemTypes.has(pt) && !reservedPT.has(pt)) {
      warnings.push({
        severity: "warning",
        path: null,
        field: "problem_type",
        message: `KNOWN_PROBLEM_TYPES entry '${pt}' is not used by any doc (add a doc with this problem_type or move to RESERVED_PROBLEM_TYPES)`,
      });
    }
  }

  for (const tag of KNOWN_TAGS) {
    if (!usedTags.has(tag) && !reservedTags.has(tag)) {
      warnings.push({
        severity: "warning",
        path: null,
        field: "tags",
        message: `KNOWN_TAGS entry '${tag}' is not used by any doc (remove or move to RESERVED_TAGS)`,
      });
    }
  }

  return { errors, warnings };
}
