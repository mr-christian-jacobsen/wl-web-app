import { getCurrentBranch, getShortBranch } from "@/lib/git-branch";

/**
 * Floating "you are on branch X" pill, top-right corner, dev only.
 *
 * Helps when running multiple worktrees of this repo on different
 * ports — the UI is otherwise identical between branches and it's
 * easy to test on the wrong window. The pill is `pointer-events:
 * none` so it can't intercept clicks; `select-none` so accidental
 * drags don't select its text. Hovering surfaces the full branch
 * name as a tooltip when the short version isn't enough.
 *
 * Returns null in production (gated inside `getCurrentBranch`) and
 * when no branch is resolvable, so the component is safe to render
 * unconditionally in the root layout.
 */
export function DevBranchBadge() {
  const short = getShortBranch();
  const full = getCurrentBranch();
  if (!short || !full) return null;

  return (
    <div
      className="pointer-events-none fixed right-2 top-2 z-50 select-none rounded-full bg-amber-400/95 px-3 py-1 font-mono text-xs font-semibold text-amber-950 shadow-lg ring-1 ring-amber-700/40 dark:bg-amber-300/90 dark:text-amber-950"
      title={`Branch: ${full}`}
      aria-label={`Development build from branch ${full}`}
    >
      {short}
    </div>
  );
}
