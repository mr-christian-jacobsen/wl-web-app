#!/usr/bin/env node
/**
 * Seed the current git worktree's `prisma/dev.db` with a copy of the main
 * repo's `prisma/dev.db`, then reconcile the schema with `pnpm db:push` so
 * the worktree's branch (which may add or modify Prisma models) ends up
 * with data and a current schema.
 *
 * Why this exists: SQLite is file-based, and `prisma/` is not shared
 * across worktrees, so every new worktree starts with an empty database.
 * That's annoying when you want to test against realistic data without
 * re-seeding from scratch each time.
 *
 * Refuses to run if invoked from the main repo (nothing to seed FROM in
 * that case — the main repo IS the source of truth). Backs up the
 * current worktree dev.db before overwriting, so nothing is lost if the
 * worktree had local-only state worth preserving.
 *
 * Use:
 *   pnpm db:seed-from-main
 *
 * Or directly:
 *   node scripts/seed-worktree-db.mjs
 *
 * Stop the dev server first — SQLite on Windows can refuse the copy with
 * a sharing violation if Next.js still has the file open.
 */

import { execSync } from "node:child_process";
import { existsSync, copyFileSync, statSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// --- Discover the main repo + the current worktree ----------------------

let gitDir;
let commonDir;
try {
  gitDir = git("rev-parse --absolute-git-dir");
  commonDir = resolve(git("rev-parse --git-common-dir"));
} catch {
  fail("Not inside a git repository.");
}

const isWorktree = gitDir !== commonDir;
if (!isWorktree) {
  fail(
    "Refusing to run from the main repo — nothing to copy FROM. " +
      "Run this from inside a worktree under `.claude/worktrees/`.",
  );
}

// `commonDir` is the main repo's `.git`. Its parent is the main repo root.
const mainRepoRoot = resolve(commonDir, "..");
const worktreeRoot = git("rev-parse --show-toplevel");

const sourceDb = join(mainRepoRoot, "prisma", "dev.db");
const targetDb = join(worktreeRoot, "prisma", "dev.db");

console.log(`Source: ${sourceDb}`);
console.log(`Target: ${targetDb}\n`);

if (!existsSync(sourceDb)) {
  fail(
    `Main repo dev.db not found.\n  Run \`pnpm db:push\` from ${mainRepoRoot} first, ` +
      `or seed it with whatever data you want to share across worktrees.`,
  );
}

// --- Back up the current worktree dev.db if it has anything in it -------

if (existsSync(targetDb)) {
  const size = statSync(targetDb).size;
  if (size > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${targetDb}.backup-${ts}`;
    renameSync(targetDb, backupPath);
    console.log(`✓ Backed up existing dev.db → ${backupPath}\n`);
  }
}

// --- Copy ----------------------------------------------------------------

try {
  copyFileSync(sourceDb, targetDb);
} catch (e) {
  if (e.code === "EBUSY" || /sharing violation/i.test(e.message ?? "")) {
    fail(
      "Copy failed — the dev.db file is locked. " +
        "Stop the dev server (pnpm dev) and try again.",
    );
  }
  throw e;
}
console.log(`✓ Copied main repo's dev.db into the worktree.\n`);

// --- Reconcile schema with the worktree branch's prisma/schema.prisma ---

console.log("Running `pnpm db:push` to reconcile schema with this branch...");
try {
  execSync("pnpm db:push", { stdio: "inherit" });
} catch {
  fail(
    "pnpm db:push failed. The copied dev.db may have a schema that's " +
      "incompatible with this worktree's branch — resolve manually, or " +
      "drop the dev.db and re-run `pnpm db:push` for a fresh empty DB.",
  );
}

console.log(
  `\n✓ Worktree DB seeded from main repo and schema reconciled.\n` +
    `  Restart your dev server (\`pnpm dev\`) to pick up the new data.`,
);
