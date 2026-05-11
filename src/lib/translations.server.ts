import { cache } from "react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDefaultLanguage, getDefaultLanguageId } from "@/lib/languages";
import {
  KNOWN_TRANSLATIONS,
  translate,
  type TranslateParams,
  type TranslationDict,
  type TranslationKeyDef,
} from "@/lib/translations";

/**
 * Server-side translation engine. Lives in its own module (not
 * `translations.ts`) so the registry stays import-safe from the
 * client; this file pulls in Prisma and the default-language helpers.
 */

/**
 * Reflect every entry from `KNOWN_TRANSLATIONS` into the DB.
 *
 * Cheap to call on hot paths because the upserts are key-only and the
 * default-language insert is gated by an existence check — running it
 * a second time after a clean start is essentially a no-op (one read
 * per known key).
 *
 * On the first run after a deploy that adds a key:
 *   - The `TranslationKey` row is upserted (name/description from code
 *     overrides any drift in the DB, which is what an admin would want
 *     when devs reword the admin-facing label).
 *   - A `Translation` row for the default language is inserted with the
 *     `defaultValue` from code IF no row for `(key, defaultLang)`
 *     already exists. Existing translations are never overwritten —
 *     once an admin types something the code default stops being the
 *     source of truth for that language.
 */
export async function syncTranslationKeys(): Promise<{
  upserted: number;
  defaultsInserted: number;
}> {
  const defaultLanguageId = await ensureDefaultLanguage();

  let upserted = 0;
  let defaultsInserted = 0;

  for (const entry of KNOWN_TRANSLATIONS) {
    const keyRow = await prisma.translationKey.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        name: entry.name,
        description: entry.description ?? null,
      },
      update: {
        name: entry.name,
        description: entry.description ?? null,
      },
      select: { id: true },
    });
    upserted += 1;

    // Insert the default-language row only if it's missing — never
    // touch what an admin has already translated.
    const existing = await prisma.translation.findUnique({
      where: {
        translationKeyId_languageId: {
          translationKeyId: keyRow.id,
          languageId: defaultLanguageId,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.translation.create({
        data: {
          translationKeyId: keyRow.id,
          languageId: defaultLanguageId,
          value: entry.defaultValue,
        },
      });
      defaultsInserted += 1;
    }
  }

  return { upserted, defaultsInserted };
}

/**
 * Build a `Record<key, string>` dictionary for the given language.
 *
 * Fallback chain (applied per key):
 *   1. `Translation` row for the requested language (if any).
 *   2. `Translation` row for the default language (if any).
 *   3. `defaultValue` from `KNOWN_TRANSLATIONS` in code.
 *   4. The key string itself (so a typo screams in QA rather than
 *      rendering as blank text).
 *
 * One Prisma query per language. The result is a plain object so it
 * serializes cleanly across the server→client boundary.
 */
export async function getTranslations(
  languageId: string | null | undefined,
): Promise<TranslationDict> {
  const defaultLanguageId = await getDefaultLanguageId();
  const targetIsDefault = !languageId || languageId === defaultLanguageId;

  // Always read default-language rows so we can fall back on a per-key
  // basis when the user has a non-default language with gaps.
  const languageIds = targetIsDefault
    ? [defaultLanguageId]
    : [languageId, defaultLanguageId];

  const rows = await prisma.translation.findMany({
    where: { languageId: { in: languageIds } },
    select: {
      value: true,
      languageId: true,
      translationKey: { select: { key: true } },
    },
  });

  // Build dict in fallback order: start with code defaults, layer
  // default-language rows on top, then the requested language. Each
  // layer overrides only the keys it provides, so missing keys keep
  // the previous layer's value.
  const dict: Record<string, string> = {};

  for (const def of KNOWN_TRANSLATIONS) {
    dict[def.key] = def.defaultValue;
  }
  for (const r of rows) {
    if (r.languageId === defaultLanguageId) {
      dict[r.translationKey.key] = r.value;
    }
  }
  if (!targetIsDefault) {
    for (const r of rows) {
      if (r.languageId === languageId) {
        dict[r.translationKey.key] = r.value;
      }
    }
  }

  return dict;
}

/**
 * Convenience: list every TranslationKey row paired with its value in
 * the chosen language (or `null` when no row exists for that language).
 * Used by `/super-admin/translations` to render the editor.
 */
export async function listTranslationsForAdmin(languageId: string): Promise<
  Array<{
    keyId: string;
    key: string;
    name: string;
    description: string | null;
    translationId: string | null;
    value: string | null;
    /** "human" | "auto" | null when no row exists yet. */
    source: string | null;
    defaultValue: string;
    defaultLanguageValue: string | null;
  }>
> {
  const defaultLanguageId = await getDefaultLanguageId();

  const keyRows = await prisma.translationKey.findMany({
    orderBy: { key: "asc" },
    include: {
      values: {
        where: {
          languageId: { in: [languageId, defaultLanguageId] },
        },
        select: { id: true, value: true, languageId: true, source: true },
      },
    },
  });

  const defaultsByKey = new Map<string, TranslationKeyDef>(
    KNOWN_TRANSLATIONS.map((t) => [t.key, t]),
  );

  return keyRows.map((k) => {
    const target = k.values.find((v) => v.languageId === languageId) ?? null;
    const inDefault =
      k.values.find((v) => v.languageId === defaultLanguageId) ?? null;
    return {
      keyId: k.id,
      key: k.key,
      name: k.name,
      description: k.description,
      translationId: target?.id ?? null,
      value: target?.value ?? null,
      source: target?.source ?? null,
      defaultValue: defaultsByKey.get(k.key)?.defaultValue ?? k.key,
      defaultLanguageValue: inDefault?.value ?? null,
    };
  });
}

/**
 * Resolve the current request's preferred language id from the auth
 * session. Wrapped in React `cache` so the lookup is shared across
 * every server component in the same render tree.
 */
export const getRequestLanguageId = cache(async (): Promise<string | null> => {
  const session = await auth();
  if (!session?.user.id) return null;
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { languageId: true },
  });
  return row?.languageId ?? null;
});

/**
 * Cached convenience wrapper for server components: resolves the
 * request language and loads the translation dict in one call. Safe
 * to call from any layout or page without paying multiple queries
 * per render.
 */
export const getServerTranslations = cache(async (): Promise<TranslationDict> => {
  const languageId = await getRequestLanguageId();
  return getTranslations(languageId);
});

/**
 * Server-component equivalent of the `useTranslation` hook —
 * returns a synchronous `t(key, params?)` ready to call inside JSX.
 */
export async function getServerT(): Promise<
  (key: string, params?: TranslateParams) => string
> {
  const dict = await getServerTranslations();
  return (key: string, params?: TranslateParams) => translate(dict, key, params);
}

/**
 * Upsert a translation row for `(translationKeyId, languageId)` with
 * the supplied value + provenance.
 *
 * `source` defaults to "human" so any call from the manual editor flips
 * a previously machine-generated value back to human-reviewed without
 * extra ceremony. Pass `"auto"` from the auto-translate path so the UI
 * can flag those rows for review.
 *
 * Translations are never deleted via this path — the admin UI doesn't
 * expose deletion — but storing an empty string effectively returns the
 * key to its fallback behaviour, so the editor allows that.
 */
export async function setTranslation(opts: {
  translationKeyId: string;
  languageId: string;
  value: string;
  source?: "human" | "auto";
}): Promise<{ id: string; value: string; source: string }> {
  const source = opts.source ?? "human";
  const row = await prisma.translation.upsert({
    where: {
      translationKeyId_languageId: {
        translationKeyId: opts.translationKeyId,
        languageId: opts.languageId,
      },
    },
    create: {
      translationKeyId: opts.translationKeyId,
      languageId: opts.languageId,
      value: opts.value,
      source,
    },
    update: {
      value: opts.value,
      source,
    },
    select: { id: true, value: true, source: true },
  });
  return row;
}
