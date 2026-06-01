---
id: SOL-2026-016
title: Seed each git-worktree's SQLite `dev.db` from the main checkout to avoid empty-DB confusion
date: 2026-06-01
status: active
category: docs/solutions/architecture-patterns
module: scripts/seed-worktree-db.mjs + pnpm db:seed-from-main
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "The project uses SQLite as its dev database (file-based, lives inside the repo at `prisma/dev.db` or similar)"
  - "The team uses `git worktree add` for parallel feature work / PR review / ce-worktree-style isolation"
  - "Each fresh worktree starts empty because `prisma/` is not shared across worktrees"
  - "Developers want to test new features against realistic seed data without re-running signup flows + admin-promote scripts every time"
tags:
  - git-worktree
  - pnpm
  - prisma
  - sqlite
---

# Seed each git-worktree's SQLite `dev.db` from the main checkout to avoid empty-DB confusion

## Context

Prisma's SQLite datasource points at `file:./prisma/dev.db` — a single physical file inside the repository working tree. `git worktree add` creates a new working tree on disk with its own copy of every tracked file, but `prisma/dev.db` is `.gitignore`d, so each fresh worktree starts with **no `dev.db` at all**. Running `pnpm db:push` in the new worktree creates a schema-only file with zero rows.

This is operationally fine for a one-time setup but creates real friction in three situations:

1. **"My dev server doesn't show any data" debugging.** A worktree-resident dev server returns empty `/super-admin/users`, no surveys, no email templates — symptoms that look like a query bug or an auth misconfiguration. The actual cause is "you're running against a different physical SQLite file than the one you populated last week".

2. **Feature verification against realistic state.** Testing a new admin filter, an email-blast flow, or a query optimization requires diverse rows. Recreating the seed state via signup + `pnpm promote-admin` + manual UI clicking is slow and inconsistent across worktrees.

3. **Cross-worktree feature integration.** When two feature branches are in flight in parallel worktrees and a developer wants to verify they don't break each other against the same data, each worktree's empty `dev.db` defeats the test.

The session that surfaced this (wl-web-app, 2026-06-01) hit it three times in one day: once during the U1 schema-verification step in the tasks-and-notifications worktree, once when the running dev server showed empty `/super-admin/tasks` despite the feature being merged, and once when a parallel tag-catalog worktree's dev server was missing the user account we'd just verified existed in main.

## Guidance

Add a `pnpm db:seed-from-main` script that copies the main checkout's `prisma/dev.db` into the current worktree's `prisma/` directory and reconciles the schema. Four invariants make it safe in practice:

### 1. Refuse to run from the main checkout

The script's whole purpose is to seed a *worktree* from main. Running it in the main checkout would source-and-destination-be-the-same and either be a no-op or accidentally clobber main. Detect via:

```js
const gitDir = execSync("git rev-parse --absolute-git-dir").toString().trim();
const commonDir = resolve(execSync("git rev-parse --git-common-dir").toString().trim());
if (gitDir === commonDir) {
  fail("Refusing to run from the main repo — nothing to copy FROM. Run inside a worktree.");
}
```

`--git-dir` and `--git-common-dir` are equal in the main checkout, divergent in a worktree (the common dir is the main `.git`; the per-worktree dir lives at `.git/worktrees/<name>`). This works for any worktree depth — `.claude/worktrees/<name>/` or anywhere else.

### 2. Resolve main as `commonDir/..`

The main repo's root is always the parent of `--git-common-dir`. Compute the source `dev.db` path from there:

```js
const mainRepoRoot = resolve(commonDir, "..");
const sourceDb = join(mainRepoRoot, "prisma", "dev.db");
const targetDb = join(git("rev-parse --show-toplevel"), "prisma", "dev.db");
```

### 3. Back up before overwriting

The worktree's existing `dev.db` may carry local-only state worth keeping (a test user the developer set up for this branch, debug data, an in-flight migration probe). Rename, don't delete:

```js
if (existsSync(targetDb) && statSync(targetDb).size > 0) {
  const backupPath = `${targetDb}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  renameSync(targetDb, backupPath);
}
copyFileSync(sourceDb, targetDb);
```

`.gitignore` should match `prisma/dev.db.backup-*` so the backup files don't show up in `git status` and tempt anyone into committing one.

### 4. Run `pnpm db:push` after copy to reconcile schema

The worktree's branch may have a Prisma schema ahead of (or behind) main's. After the copy, the on-disk `dev.db` matches main's schema; `pnpm db:push` brings it forward to the branch's schema. For additive schema changes this is non-destructive. For destructive changes (column removals) Prisma will warn and require `--accept-data-loss`; surface that as a hard failure with a clear message so the developer understands the cost.

### Catch the Windows file-lock case

On Windows, copying `dev.db` while Next.js dev has it open returns `EBUSY` / "sharing violation". Detect and emit a clear instruction:

```js
catch (e) {
  if (e.code === "EBUSY" || /sharing violation/i.test(e.message ?? "")) {
    fail("Copy failed — the dev.db file is locked. Stop the dev server (pnpm dev) and try again.");
  }
  throw e;
}
```

## Why This Matters

- **Eliminates the "which dev.db is my server reading?" debugging path** at zero ongoing cost. The script runs in ~1 second.
- **Each worktree can carry a different in-flight DB state** if it wants (via the backup file); the seed is a starting point, not a sync mechanism.
- **Doesn't fight git** — `dev.db` stays `.gitignore`d, the file copy is out-of-band of git, and the backup pattern joins the ignore list so accidental commits are impossible.
- **Scales to N worktrees** without coordination. Each one pulls from main independently.
- **Survives `git worktree add` of a brand-new feature branch.** No additional setup beyond `pnpm install && pnpm db:seed-from-main` to get a usable dev environment.

## When to Apply

**Apply when:**

- The project's primary dev DB is SQLite (file-based, lives inside the repo).
- The team uses git worktrees for parallel work (one worktree per in-flight feature / PR review / agent session).
- A meaningful baseline dev dataset exists in the main checkout's `dev.db` (real-ish users, sample admin records, seed data the team has accumulated).

**Skip when:**

- The dev DB is a server (Postgres, MySQL) — there's only one physical DB and all worktrees share it via `DATABASE_URL`. The whole problem evaporates. The trade-off is whether to commit to the server-DB option in `docker-compose.yml`; for many Next.js projects the SQLite default is intentional for zero-config developer onboarding, in which case this pattern is the right level of mitigation.
- The team uses `npm-link`-style shared paths or symlinks `prisma/dev.db` between worktrees. (Caveat: SQLite + multiple writers + symlinks can corrupt the file under concurrent dev-server activity in multiple worktrees. The seed-from-main pattern explicitly copies — one writer per file.)
- No baseline dataset exists in main yet (greenfield project) — `pnpm db:push` is enough.

## Examples

### A. The script itself (TypeScript / ESM Node)

See `scripts/seed-worktree-db.mjs` in this repo. Roughly 95 lines including JSDoc. No external dependencies beyond `@prisma/client` (already present) and Node stdlib.

### B. Wire as a pnpm script

```json
{
  "scripts": {
    "db:push": "prisma db push",
    "db:seed-from-main": "node scripts/seed-worktree-db.mjs"
  }
}
```

Naming convention: the `db:` prefix groups it with the other Prisma scripts so `pnpm run` shows them adjacent.

### C. `.gitignore` adjustment

```
# prisma
prisma/dev.db
prisma/dev.db-journal
prisma/dev.db.backup-*
```

The `.backup-*` glob keeps `git status` clean across repeated invocations.

### D. Usage in a freshly-created worktree

```bash
git worktree add .claude/worktrees/new-feature feature/new-thing
cd .claude/worktrees/new-feature
pnpm install
# stop the dev server in any worktree pointing at the main dev.db, if running
pnpm db:seed-from-main
pnpm dev
```

### E. CLAUDE.md / AGENTS.md mention

Add one bullet under the `## Scripts` section so the convention is discoverable. Example wording:

> `pnpm db:seed-from-main` — copy the main repo's `prisma/dev.db` into the current git worktree and run `pnpm db:push` to reconcile the schema. Refuses to run from the main checkout. Backs up the worktree's existing `dev.db` to `prisma/dev.db.backup-<timestamp>` before overwriting. Stop the dev server first — SQLite on Windows can refuse the copy with a sharing violation when Next.js still has the file open.

## Related

- `scripts/seed-worktree-db.mjs` — the in-repo implementation.
- [PR #42](https://github.com/mr-christian-jacobsen/wl-web-app/pull/42) — landing PR with the script, the `pnpm db:seed-from-main` script entry, the `.gitignore` pattern addition, and the CLAUDE.md `## Scripts` bullet.
- `CLAUDE.md` — `## Scripts` section, where the discoverability sentence lives.
- The "Worktree workflow" mental model is broader than this script — it intersects with `ce-worktree` (the compound-engineering plugin's skill that creates isolated worktrees) and with the Next.js dev-server-per-worktree friction surfaced separately. This doc is the SQLite-specific slice.
