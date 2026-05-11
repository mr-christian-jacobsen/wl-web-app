import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getDefaultLanguageId } from "@/lib/languages";
import { formatLocaleLabel } from "@/lib/locales";
import { logError } from "@/lib/log.server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { autoTranslateBatch } from "@/lib/translate-provider";
import { KNOWN_TRANSLATIONS } from "@/lib/translations";
import { setTranslation } from "@/lib/translations.server";
import { autoTranslateRequestSchema } from "@/lib/validators";

/**
 * POST /api/super-admin/translations/auto-translate
 *
 * Body shape (see `autoTranslateRequestSchema`):
 *   {
 *     languageId: string,            // target Language row
 *     scope: "missing" | "all" | { keyIds: string[] },
 *     commit: boolean,               // true = write source="auto"; false = just return suggestions
 *   }
 *
 * - `scope: "missing"` picks every TranslationKey that has no value for
 *   the target language, or an empty string (i.e. currently falling back).
 * - `scope: "all"` re-translates every key regardless of existing value.
 * - `scope: { keyIds }` translates the given subset.
 *
 * Returns `{ provider, model, items: [{ keyId, key, translation }] }`.
 * When `commit: true` the rows are upserted with `source = "auto"` first.
 */
export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = autoTranslateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { languageId, scope, commit } = parsed.data;

  const language = await prisma.language.findUnique({
    where: { id: languageId },
    select: { id: true, countryCode: true, languageCode: true, isDefault: true },
  });
  if (!language) {
    return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  }

  // Translating into the default language would be a no-op for the
  // fallback chain — reject early so an admin doesn't burn API spend.
  if (language.isDefault) {
    return NextResponse.json(
      { error: "Auto-translate targets non-default languages only" },
      { status: 400 },
    );
  }

  const defaultLanguageId = await getDefaultLanguageId();

  // Pick the candidate keys based on the scope.
  const keys = await selectKeys({
    scope,
    languageId,
    defaultLanguageId,
  });
  if (keys.length === 0) {
    return NextResponse.json({ items: [], provider: null, model: null });
  }

  // Build the input for the provider — names/descriptions come from
  // the code registry where available so the model gets the richest
  // context we have.
  const registryByKey = new Map(KNOWN_TRANSLATIONS.map((t) => [t.key, t]));
  const inputItems = keys.map((k) => ({
    key: k.key,
    sourceText: k.sourceText,
    name: registryByKey.get(k.key)?.name ?? k.name,
    description: registryByKey.get(k.key)?.description ?? k.description ?? null,
  }));

  let result;
  try {
    result = await autoTranslateBatch({
      targetLanguageLabel: formatLocaleLabel(language.countryCode, language.languageCode),
      targetLanguageCode: language.languageCode,
      targetCountryCode: language.countryCode,
      items: inputItems,
    });
  } catch (err) {
    await logError(err, {
      context: { feature: "auto-translate.route", languageId, scope: typeof scope },
    });
    const message = err instanceof Error ? err.message : "Auto-translate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Correlate the model output back to TranslationKey ids.
  const keyIdByKeyString = new Map(keys.map((k) => [k.key, k.keyId]));
  const items = result.items
    .map((it) => {
      const keyId = keyIdByKeyString.get(it.key);
      if (!keyId) return null;
      return { keyId, key: it.key, translation: it.translation };
    })
    .filter((x): x is { keyId: string; key: string; translation: string } => x !== null);

  if (commit) {
    // Persist with source="auto" so the editor can flag them for review.
    // Updates are sequential because the unique constraint is
    // (translationKeyId, languageId) and upsert needs that path.
    for (const it of items) {
      await setTranslation({
        translationKeyId: it.keyId,
        languageId,
        value: it.translation,
        source: "auto",
      });
    }
  }

  return NextResponse.json({
    provider: result.provider,
    model: result.model,
    items,
  });
}

type Candidate = {
  keyId: string;
  key: string;
  name: string;
  description: string | null;
  sourceText: string;
};

/**
 * Resolve the scope to a concrete list of TranslationKey rows + the
 * source English text to translate (the default-language `Translation`
 * value, or the code registry default if no row exists yet).
 */
async function selectKeys(opts: {
  scope: "missing" | "all" | { keyIds: string[] };
  languageId: string;
  defaultLanguageId: string;
}): Promise<Candidate[]> {
  const where =
    typeof opts.scope === "object" ? { id: { in: opts.scope.keyIds } } : undefined;

  const keys = await prisma.translationKey.findMany({
    where,
    orderBy: { key: "asc" },
    include: {
      values: {
        where: {
          languageId: { in: [opts.languageId, opts.defaultLanguageId] },
        },
        select: { value: true, languageId: true },
      },
    },
  });

  const registryByKey = new Map(KNOWN_TRANSLATIONS.map((t) => [t.key, t]));

  const out: Candidate[] = [];
  for (const k of keys) {
    const target = k.values.find((v) => v.languageId === opts.languageId);
    if (opts.scope === "missing" && target && target.value.length > 0) continue;

    const inDefault = k.values.find((v) => v.languageId === opts.defaultLanguageId);
    const fromRegistry = registryByKey.get(k.key)?.defaultValue;
    const sourceText =
      (inDefault?.value && inDefault.value.length > 0 ? inDefault.value : undefined) ??
      fromRegistry ??
      k.key;

    out.push({
      keyId: k.id,
      key: k.key,
      name: k.name,
      description: k.description,
      sourceText,
    });
  }
  return out;
}
