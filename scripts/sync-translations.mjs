#!/usr/bin/env node
/**
 * Reflect the in-code translation registry into the DB without going
 * through the Next.js instrumentation hook.
 *
 * Run with:  pnpm sync-translations
 *
 * The primary path for keeping the DB in sync with code is
 * `instrumentation.ts`'s `register()` callback, which Next.js invokes
 * once at server boot. This script is a backstop for situations
 * where that hook isn't a fit:
 *   - Dev-mode hot-reload occasionally doesn't re-run `register()`
 *     after a code edit, leaving newly-added keys invisible until the
 *     next cold start (or a `.next` cache wipe).
 *   - CI / deployment pipelines that want to seed translations
 *     before the first request hits the app — e.g. so a smoke-test
 *     can call `/api/super-admin/translations/auto-translate`
 *     without a warm-up request first.
 *   - Operators triaging a misbehaving production seed who don't
 *     have super-admin auth handy to click "Sync from code" in the UI.
 *
 * Implementation: we parse the `KNOWN_TRANSLATIONS` array literally
 * out of `src/lib/translations.ts` rather than importing the TS
 * module (that would require a transpiler + the project's path-alias
 * resolver — neither available to plain Node). The parser handles
 * the two literal shapes the registry uses (single-line and
 * multi-line) but is intentionally narrow — anything fancier should
 * go through `syncTranslationKeys()` in `translations.server.ts`,
 * which is the source of truth for the upsert semantics.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const REGISTRY_PATH = resolve("src/lib/translations.ts");
const DEFAULT_LANG = { countryCode: "GB", languageCode: "en" };

const prisma = new PrismaClient();

function parseRegistry(source) {
  // Each entry is a JS object literal containing at minimum `key:` and
  // `defaultValue:`. The shape is tightly controlled so a simple
  // line-walker is enough — we don't need a full JS parser.
  const entries = [];
  let current = null;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const keyMatch = trimmed.match(/^key:\s*"([^"]+)",?\s*$/);
    const nameMatch = trimmed.match(/^name:\s*"((?:\\.|[^"\\])*)",?\s*$/);
    const descMatch = trimmed.match(/^description:\s*"((?:\\.|[^"\\])*)",?\s*$/);
    const valueMatch = trimmed.match(/^defaultValue:\s*"((?:\\.|[^"\\])*)",?\s*$/);
    // Single-line `{ key: "...", name: "...", defaultValue: "..." }`.
    const inline = trimmed.match(
      /^\{\s*key:\s*"([^"]+)",\s*name:\s*"((?:\\.|[^"\\])*)",(?:\s*description:\s*"((?:\\.|[^"\\])*)",)?\s*defaultValue:\s*"((?:\\.|[^"\\])*)"\s*\},?$/,
    );
    if (inline) {
      entries.push({
        key: inline[1],
        name: unescape(inline[2]),
        description: inline[3] ? unescape(inline[3]) : null,
        defaultValue: unescape(inline[4]),
      });
      continue;
    }
    if (keyMatch) {
      if (current?.key && current.defaultValue !== undefined) {
        entries.push({
          key: current.key,
          name: current.name ?? "",
          description: current.description ?? null,
          defaultValue: current.defaultValue,
        });
      }
      current = { key: keyMatch[1] };
      continue;
    }
    if (!current) continue;
    if (nameMatch) current.name = unescape(nameMatch[1]);
    else if (descMatch) current.description = unescape(descMatch[1]);
    else if (valueMatch) current.defaultValue = unescape(valueMatch[1]);
  }
  if (current?.key && current.defaultValue !== undefined) {
    entries.push({
      key: current.key,
      name: current.name ?? "",
      description: current.description ?? null,
      defaultValue: current.defaultValue,
    });
  }
  return entries;
}

function unescape(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

const source = readFileSync(REGISTRY_PATH, "utf8");
const entries = parseRegistry(source);
console.log(`parsed ${entries.length} registry entries from src/lib/translations.ts`);

// Ensure the default language exists so we have a target for the
// default-language Translation rows.
const defaultLang = await prisma.language.upsert({
  where: {
    countryCode_languageCode: {
      countryCode: DEFAULT_LANG.countryCode,
      languageCode: DEFAULT_LANG.languageCode,
    },
  },
  create: { ...DEFAULT_LANG, isDefault: true },
  update: { isDefault: true },
  select: { id: true },
});

let upserted = 0;
let defaultsInserted = 0;
for (const entry of entries) {
  const keyRow = await prisma.translationKey.upsert({
    where: { key: entry.key },
    create: {
      key: entry.key,
      name: entry.name,
      description: entry.description,
    },
    update: {
      name: entry.name,
      description: entry.description,
    },
    select: { id: true },
  });
  upserted += 1;
  const existing = await prisma.translation.findUnique({
    where: {
      translationKeyId_languageId: {
        translationKeyId: keyRow.id,
        languageId: defaultLang.id,
      },
    },
    select: { id: true },
  });
  if (!existing) {
    await prisma.translation.create({
      data: {
        translationKeyId: keyRow.id,
        languageId: defaultLang.id,
        value: entry.defaultValue,
      },
    });
    defaultsInserted += 1;
  }
}

console.log(
  `sync done — upserted ${upserted} key${upserted === 1 ? "" : "s"}, ` +
    `inserted ${defaultsInserted} new default-language row${
      defaultsInserted === 1 ? "" : "s"
    }.`,
);

await prisma.$disconnect();
