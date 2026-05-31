/**
 * Server-only loader for the docs/solutions browse page.
 *
 * Scans `docs/solutions/**\/*.md` at request time, parses each file's
 * frontmatter via the validator's `parseFrontmatter`, and returns a
 * typed `SolutionDoc[]`. Wrapped in React `cache()` so a single page
 * render does exactly one disk scan no matter how many components ask.
 *
 * Imports from this module are flagged via the `.server.ts` suffix —
 * including it from a client component is a Next.js build error.
 *
 * Security notes:
 *   - File reads are restricted to paths whose resolved location stays
 *     under SOLUTIONS_ROOT (rejects symlink escapes).
 *   - `GITHUB_REPO_URL`, when set, must start with `https://` before it
 *     is used to build outbound source links. Other schemes are
 *     ignored as a guard against operator misconfiguration.
 */
import "server-only";

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { cache } from "react";

import { isKnownProblemType, isKnownStatus, isKnownTag } from "./catalog";
import type {
  KnownProblemType,
  KnownStatus,
  KnownTag,
} from "./catalog";
import { parseFrontmatter } from "./validate";
import type { SolutionDoc, SolutionFrontmatter } from "./types";

const SOLUTIONS_ROOT = resolve("docs/solutions");

function toRepoRelative(absolute: string): string {
  const rel = absolute.startsWith(process.cwd())
    ? absolute.slice(process.cwd().length).replace(/^[\\/]/, "")
    : absolute;
  return rel.split(/[\\/]/).join("/");
}

function isInsideRoot(absolute: string): boolean {
  // Resolve real paths to defeat symlinks pointing outside the tree.
  // If realpathSync fails (e.g., file disappeared between scan and read),
  // fall back to a literal prefix check on the resolved path.
  let real: string;
  try {
    real = realpathSync(absolute);
  } catch {
    real = resolve(absolute);
  }
  const root = (() => {
    try {
      return realpathSync(SOLUTIONS_ROOT);
    } catch {
      return SOLUTIONS_ROOT;
    }
  })();
  return real === root || real.startsWith(root + sep);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function asKnownTags(value: unknown): KnownTag[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: KnownTag[] = [];
  for (const v of value) {
    if (typeof v === "string" && isKnownTag(v)) {
      out.push(v as KnownTag);
    }
  }
  return out;
}

function asKnownProblemType(value: unknown): KnownProblemType | undefined {
  if (typeof value !== "string") return undefined;
  return isKnownProblemType(value) ? (value as KnownProblemType) : undefined;
}

function asKnownStatus(value: unknown): KnownStatus | undefined {
  if (typeof value !== "string") return undefined;
  return isKnownStatus(value) ? (value as KnownStatus) : undefined;
}

/**
 * Reads `GITHUB_REPO_URL` from the process environment and returns it
 * only when it is a syntactically reasonable https URL. Any other
 * value — empty, undefined, `javascript:`, `data:`, `http://...` —
 * returns `null` so callers fall back to rendering the path as text.
 */
export function getGithubRepoBaseUrl(): string | null {
  const raw = process.env.GITHUB_REPO_URL;
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!raw.startsWith("https://")) return null;
  // Strip a trailing slash so concatenation produces a clean URL.
  return raw.replace(/\/+$/, "");
}

/**
 * Construct a GitHub blob URL for a repo-relative path. Returns `null`
 * when no usable GITHUB_REPO_URL is configured.
 *
 * Hardcodes `master` as the branch — when the default branch is
 * renamed, this constant changes. (A future enhancement could read the
 * branch from a second env var; not in scope today.)
 */
export function buildSourceUrl(repoRelativePath: string): string | null {
  const base = getGithubRepoBaseUrl();
  if (base === null) return null;
  return `${base}/blob/master/${repoRelativePath}`;
}

/**
 * Scans `docs/solutions/` and returns one entry per markdown file.
 * Wrapped in React `cache()` so a single render performs exactly one
 * scan regardless of how many components call this loader.
 */
export const scanDocs = cache((): SolutionDoc[] => {
  const files = walk(SOLUTIONS_ROOT);
  const out: SolutionDoc[] = [];

  for (const file of files) {
    if (!isInsideRoot(file)) continue; // path-containment guard

    const src = readFileSync(file, "utf8");
    const parsed = parseFrontmatter(src);
    const fm = (parsed.frontmatter ?? null) as SolutionFrontmatter | null;
    const repoPath = toRepoRelative(file);

    out.push({
      path: repoPath,
      frontmatter: fm,
      id: typeof fm?.id === "string" ? fm.id : undefined,
      title: typeof fm?.title === "string" ? fm.title : undefined,
      status: asKnownStatus(fm?.status),
      problemType: asKnownProblemType(fm?.problem_type),
      tags: asKnownTags(fm?.tags),
    });
  }

  // Sort by id so the rendered table has a stable order.
  out.sort((a, b) => {
    const ai = a.id ?? "";
    const bi = b.id ?? "";
    if (ai && bi) return ai.localeCompare(bi);
    if (ai) return -1;
    if (bi) return 1;
    return a.path.localeCompare(b.path);
  });

  return out;
});
