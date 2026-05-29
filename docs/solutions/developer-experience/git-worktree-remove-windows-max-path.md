---
title: Removing a git worktree on Windows when node_modules exceeds MAX_PATH
date: 2026-05-29
category: docs/solutions/developer-experience
module: development environment (Windows / pnpm worktrees)
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - "Working on Windows where the 260-character MAX_PATH limit is in effect"
  - "Removing a git worktree that contains an installed node_modules tree"
  - "Using pnpm workspaces or any deep dependency graph that produces long nested paths"
  - "`git worktree remove` fails to delete the directory, or the worktree folder is already gone but metadata lingers"
tags: [git-worktree, windows, max-path, pnpm, node-modules, powershell]
---

# Removing a git worktree on Windows when node_modules exceeds MAX_PATH

## Context

`git worktree remove <path>` deletes the worktree directory by walking it and
removing every file. On Windows, the classic 260-character `MAX_PATH` limit
trips this up: a worktree that has had `pnpm install` run inside it carries a
`node_modules` tree whose deeply nested dependency paths routinely blow past
260 characters. git (and most tools that call the Win32 file APIs without
opting in to long paths) cannot stat or unlink those files, so the removal
fails partway through and the worktree won't go away cleanly.

This bit us cleaning up a `.claude/worktrees/` feature worktree. pnpm
workspaces plus a deep dependency graph make the overflow common, and the
fix — a long-path-prefixed `Remove-Item` — is non-obvious unless you already
know the Win32 `\\?\` escape hatch.

## Guidance

Delete `node_modules` first using PowerShell with the Windows long-path
prefix, then let `git worktree remove` (or `git worktree prune`) clean up the
now-shallow tree.

The long-path prefix is **backslash, backslash, question-mark, backslash**
(`\\?\`) placed immediately before the **absolute** path. It tells the Win32
file APIs to skip `MAX_PATH` normalization and accept paths up to ~32,767
characters, which is what lets `Remove-Item -Recurse` finally walk the entire
`node_modules` tree.

```powershell
# 1. Nuke node_modules with the long-path escape hatch (absolute path required).
Remove-Item -Recurse -Force "\\?\C:\Users\you\Documents\GitHub\wl-web-app\.claude\worktrees\my-feature\node_modules"

# 2. Now the tree is shallow enough for git to finish the removal.
git worktree remove .claude/worktrees/my-feature
```

If the worktree directory is **already gone** (you deleted it by hand, or a
partial removal left nothing but stale bookkeeping), `git worktree remove`
will complain that the worktree does not exist. In that case, clean up the
leftover metadata under `.git/worktrees/` with:

```powershell
git worktree prune
```

`git worktree prune` removes administrative entries for worktrees whose
working directory no longer exists, which is exactly the state you land in
after a manual or partial delete.

## Why This Matters

Without the long-path prefix you get stuck in a loop: `git worktree remove`
fails, you try to delete the folder in Explorer or with a plain
`Remove-Item`, that also fails on the same long paths, and the worktree
lingers — both on disk and as an entry git keeps tracking. The `\\?\` prefix
is the single thing that unblocks the delete; once `node_modules` is gone the
remaining files are short-pathed and ordinary tooling handles them. Knowing
the prefix exists (and that `git worktree prune` exists for the
already-deleted case) turns a frustrating dead end into two commands.

It is worth enabling long paths globally on dev machines as a longer-term fix
(`git config --global core.longpaths true`, plus the Windows
`LongPathsEnabled` registry / Group Policy switch), but the `\\?\` trick works
immediately and needs no machine-wide changes or elevation.

## When to Apply

- A `git worktree remove` on Windows fails midway with access/path errors and
  the worktree had `node_modules` installed.
- You need to delete any directory tree on Windows whose nested paths exceed
  260 characters and plain `Remove-Item` / Explorer refuse.
- The worktree folder is already missing but `git worktree list` still shows
  it — reach for `git worktree prune`.

## Examples

Before — fails because git can't walk the over-length `node_modules` paths:

```powershell
git worktree remove .claude/worktrees/my-feature
# error: unable to remove ... node_modules\.pnpm\@some\very\deep\...  (path too long)
```

After — remove the heavy tree with the long-path prefix, then let git finish:

```powershell
Remove-Item -Recurse -Force "\\?\C:\Users\you\Documents\GitHub\wl-web-app\.claude\worktrees\my-feature\node_modules"
git worktree remove .claude/worktrees/my-feature
```

Already-deleted directory — only the metadata remains:

```powershell
git worktree prune   # drops the stale .git/worktrees/my-feature entry
```

## Related

- `git worktree` docs: `git help worktree` (`add`, `remove`, `prune`).
- Microsoft "Maximum Path Length Limitation" — the `\\?\` long-path prefix and
  the `LongPathsEnabled` opt-in.
- This repo uses `.claude/worktrees/` (see `.gitignore`) for parallel feature
  work, so this cleanup path comes up whenever a worktree is torn down on
  Windows after a `pnpm install`.
