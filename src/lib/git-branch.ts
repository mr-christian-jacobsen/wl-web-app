import { execSync } from "child_process";

/**
 * Resolve the git branch name for the running dev server.
 *
 * Why this exists: when you run multiple worktrees of this repo
 * simultaneously (different branches, different ports), the browser
 * windows look identical and it's easy to make a change on the wrong
 * one. `DevBranchBadge` puts the branch name on every page in dev so
 * that confusion is visible at a glance.
 *
 * Cached at module scope rather than per-render — branch names don't
 * change while the server is running (a `git checkout` inside the
 * worktree without restarting the server is rare and would also
 * invalidate other in-memory state, so the stale-branch case is not
 * worth designing around). First call pays a ~20-50 ms `execSync`
 * cost; every subsequent call is a memory read.
 *
 * Returns `null` in production (no dev signal needed) and on any
 * failure (e.g., the source tree isn't a git checkout). Callers must
 * tolerate `null` and render nothing in that case.
 */
let cached: string | null | undefined = undefined;

export function getCurrentBranch(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (cached !== undefined) return cached;
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    cached = branch.length > 0 ? branch : null;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Short, badge-friendly version of the branch name. `claude/awesome-noyce-c412c9`
 * collapses to `awesome-noyce-c412c9` — the slash prefix is meaningful only as
 * a namespace, and the trailing segment is the distinctive part.
 */
export function getShortBranch(): string | null {
  const full = getCurrentBranch();
  if (!full) return null;
  if (full === "HEAD") return null; // detached HEAD shows the SHA via the full name
  return full.includes("/") ? (full.split("/").pop() ?? full) : full;
}
