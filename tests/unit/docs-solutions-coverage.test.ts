import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { KNOWN_PROBLEM_TYPES, KNOWN_TAGS } from "@/lib/docs-solutions/catalog";
import {
  parseFrontmatter,
  validateCorpus,
  validateDoc,
} from "@/lib/docs-solutions/validate";
import type { CorpusInput } from "@/lib/docs-solutions/validate";

/**
 * Walks `docs/solutions/**\/*.md` and asserts every doc passes the
 * frontmatter validator. Mirrors the shape of
 * `tests/unit/openapi-coverage.test.ts`:
 *
 *   - anchor with `path.resolve(__dirname, "../../docs/solutions")`,
 *     never `process.cwd()`
 *   - walker uses `fs.readdirSync({ withFileTypes: true })`
 *   - Windows-safe path normalisation via `split(/[\\/]/)`
 *   - `expect(errors, multi-line-msg).toEqual([])` so failures surface
 *     the exact rule + file in CI output
 *   - explicit `RESERVED_PROBLEM_TYPES` exclusion set keeps orphan
 *     warnings quiet for enum values pre-registered for future use
 */

const SOLUTIONS_ROOT = path.resolve(__dirname, "../../docs/solutions");

/**
 * `problem_type` values registered in KNOWN_PROBLEM_TYPES but not yet
 * used by any current doc. Without this set, every unused enum value
 * would emit an orphan-warning at PR1 launch. Move entries off this
 * list as docs of those types are added.
 */
const RESERVED_PROBLEM_TYPES = new Set<string>([
  "best_practice",
  "build_error",
  "convention",
  "database_issue",
  "design_pattern",
  "documentation_gap",
  "integration_issue",
  "logic_error",
  "performance_issue",
  "test_failure",
  "ui_bug",
]);

/**
 * `KNOWN_TAGS` entries that are registered but no current doc uses.
 * Same role as RESERVED_PROBLEM_TYPES — keep launch warnings quiet
 * without silently tolerating drift. At PR1 launch every registered
 * tag is used by at least one doc, so this set is empty; entries get
 * added when a doc carrying a tag is removed without removing the tag.
 */
const RESERVED_TAGS = new Set<string>([]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function toRepoRelative(filePath: string): string {
  const rel = path.relative(path.resolve(SOLUTIONS_ROOT, "../.."), filePath);
  // Normalise Windows backslashes so the category check in validateDoc
  // sees forward-slash paths regardless of host OS.
  return rel.split(/[\\/]/).join("/");
}

function loadCorpus(): { inputs: CorpusInput[]; allIds: Set<string> } {
  const files = walk(SOLUTIONS_ROOT);
  const inputs: CorpusInput[] = [];
  const allIds = new Set<string>();

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(src);
    const repoPath = toRepoRelative(file);
    inputs.push({ path: repoPath, parsed });

    const fm = parsed.frontmatter as { id?: unknown } | null;
    if (fm && typeof fm.id === "string" && fm.id !== "") {
      allIds.add(fm.id);
    }
  }

  return { inputs, allIds };
}

describe("docs/solutions coverage", () => {
  it("every doc passes per-doc schema validation", () => {
    const { inputs, allIds } = loadCorpus();
    const errors: string[] = [];

    for (const input of inputs) {
      const { errors: docErrors } = validateDoc(input.parsed, input.path, allIds);
      for (const err of docErrors) {
        errors.push(`${err.path}: ${err.message}`);
      }
    }

    expect(
      errors,
      `Per-doc validation failures:\n${errors.join("\n")}`,
    ).toEqual([]);
  });

  it("the corpus passes catalog-level checks (uniqueness, supersedes graph, orphan warnings)", () => {
    const { inputs } = loadCorpus();
    const { errors, warnings } = validateCorpus(inputs, {
      reservedProblemTypes: RESERVED_PROBLEM_TYPES,
      reservedTags: RESERVED_TAGS,
    });

    // Errors are CI-blocking.
    const errorLines = errors.map((e) => `${e.path ?? "(corpus)"}: ${e.message}`);
    expect(
      errorLines,
      `Corpus validation errors:\n${errorLines.join("\n")}`,
    ).toEqual([]);

    // Warnings are advisory — print them to stdout so they're visible in
    // CI logs without failing the test.
    if (warnings.length > 0) {
      const formatted = warnings
        .map((w) => `  - ${w.path ?? "(corpus)"}: ${w.message}`)
        .join("\n");
      // eslint-disable-next-line no-console
      console.warn(
        `docs/solutions catalog warnings (${warnings.length}):\n${formatted}`,
      );
    }
  });

  it("RESERVED_PROBLEM_TYPES is a subset of KNOWN_PROBLEM_TYPES", () => {
    // Drift guard: if KNOWN_PROBLEM_TYPES drops an entry that's still
    // reserved here, the reservation is meaningless. Fail loudly.
    const unknown: string[] = [];
    for (const pt of RESERVED_PROBLEM_TYPES) {
      if (!KNOWN_PROBLEM_TYPES.includes(pt as never)) {
        unknown.push(pt);
      }
    }
    expect(
      unknown,
      `RESERVED_PROBLEM_TYPES contains entries not in KNOWN_PROBLEM_TYPES: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("RESERVED_TAGS is a subset of KNOWN_TAGS", () => {
    const unknown: string[] = [];
    for (const tag of RESERVED_TAGS) {
      if (!KNOWN_TAGS.includes(tag as never)) {
        unknown.push(tag);
      }
    }
    expect(
      unknown,
      `RESERVED_TAGS contains entries not in KNOWN_TAGS: ${unknown.join(", ")}`,
    ).toEqual([]);
  });
});
