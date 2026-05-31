#!/usr/bin/env node
/**
 * Insert skeleton entries for any required frontmatter field missing
 * from a doc under `docs/solutions/`. The autofix never invents values
 * the author must decide — it inserts a commented-placeholder line so
 * the field is visible in the diff and the author can fill it in.
 *
 * Run with:  pnpm docs:fix
 *
 * Idempotent: re-running on a corpus with no missing fields produces
 * zero diff. Failures (unparseable YAML, missing `---` block) abort
 * with exit code 1 after printing the offending file.
 *
 * Implementation note: `REQUIRED_FIELDS` is parsed out of
 * `src/lib/docs-solutions/catalog.ts` via line-walker regex rather
 * than imported (no ts-node / tsx in devDependencies). The regex is
 * narrow on purpose — see `parseRequiredFields()` below — and is
 * paired with a sanity check (must find at least one entry).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const CATALOG_PATH = resolve("src/lib/docs-solutions/catalog.ts");
const SOLUTIONS_ROOT = resolve("docs/solutions");

// ─── Parse REQUIRED_FIELDS out of catalog.ts ───────────────────────────────

function parseRequiredFields(source) {
  // Match a block like:
  //   export const REQUIRED_FIELDS = [
  //     "title",
  //     "date",
  //     ...
  //   ] as const ...
  const blockMatch = /export\s+const\s+REQUIRED_FIELDS\s*=\s*\[([\s\S]*?)\]/m.exec(source);
  if (!blockMatch) return [];
  const body = blockMatch[1];
  const entries = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    const m = trimmed.match(/^"([^"]+)",?\s*$/);
    if (m) entries.push(m[1]);
  }
  return entries;
}

const catalogSource = readFileSync(CATALOG_PATH, "utf8");
const REQUIRED_FIELDS = parseRequiredFields(catalogSource);

if (REQUIRED_FIELDS.length === 0) {
  console.error(
    `[docs:fix] failed to parse REQUIRED_FIELDS from ${CATALOG_PATH} — aborting`,
  );
  process.exit(1);
}

console.log(
  `[docs:fix] required fields (${REQUIRED_FIELDS.length}): ${REQUIRED_FIELDS.join(", ")}`,
);

// ─── Walk docs/solutions ──────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile() && name.endsWith(".md")) out.push(full);
  }
  return out;
}

// ─── Frontmatter split + parse ────────────────────────────────────────────

function splitFrontmatter(source) {
  const text = source.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n)([\s\S]*)$/.exec(text);
  if (!m) return null;
  const [, matter, eol, body] = m;
  return { matter, eol, body };
}

// ─── Apply fixes ──────────────────────────────────────────────────────────

let checked = 0;
let fixed = 0;
let failed = 0;

const files = walk(SOLUTIONS_ROOT);
for (const file of files) {
  checked += 1;
  const original = readFileSync(file, "utf8");
  const split = splitFrontmatter(original);
  if (!split) {
    console.error(`[docs:fix] ${file}: no frontmatter --- block — skipping`);
    failed += 1;
    continue;
  }

  let parsed;
  try {
    parsed = parseYaml(split.matter);
  } catch (err) {
    console.error(`[docs:fix] ${file}: malformed YAML (${err.message}) — skipping`);
    failed += 1;
    continue;
  }

  if (parsed === null || parsed === undefined) parsed = {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(`[docs:fix] ${file}: frontmatter is not a mapping — skipping`);
    failed += 1;
    continue;
  }

  const missing = REQUIRED_FIELDS.filter(
    (field) => parsed[field] === undefined || parsed[field] === null || parsed[field] === "",
  );

  if (missing.length === 0) continue;

  // Insert commented placeholder lines for each missing field at the end
  // of the frontmatter block. The author must replace each `# TODO:`
  // with a real value — the autofix never invents content.
  const placeholders = missing
    .map((field) => `# ${field}: # TODO: fill in ${field}`)
    .join("\n");
  const newMatter = `${split.matter.replace(/\r?\n$/, "")}\n${placeholders}`;
  const newSource = `---${split.eol}${newMatter}${split.eol}---${split.eol}${split.body}`;
  writeFileSync(file, newSource, "utf8");
  fixed += 1;
  console.log(
    `[docs:fix] ${file}: inserted placeholders for ${missing.join(", ")}`,
  );
}

console.log(
  `[docs:fix] done — checked ${checked} doc${checked === 1 ? "" : "s"}, ` +
    `fixed ${fixed}, failed ${failed}`,
);

if (failed > 0) process.exit(1);
