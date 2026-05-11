import { prisma } from "@/lib/db";
import { DEFAULT_LANGUAGE } from "@/lib/locales";

/**
 * Make sure the seeded default Language row exists. Called from the
 * `/super-admin/languages` page and the list API so the table always
 * shows English even on a fresh database — no separate seed script.
 *
 * The unique `(countryCode, languageCode)` constraint means this is a
 * cheap upsert; we never overwrite the row, only set `isDefault = true`
 * if it had drifted to false. Returns the row's `id` so callers that
 * need it (e.g. the email-templates page) don't need a second query.
 */
export async function ensureDefaultLanguage(): Promise<string> {
  const row = await prisma.language.upsert({
    where: {
      countryCode_languageCode: {
        countryCode: DEFAULT_LANGUAGE.countryCode,
        languageCode: DEFAULT_LANGUAGE.languageCode,
      },
    },
    create: {
      countryCode: DEFAULT_LANGUAGE.countryCode,
      languageCode: DEFAULT_LANGUAGE.languageCode,
      isDefault: true,
    },
    update: { isDefault: true },
    select: { id: true },
  });
  return row.id;
}

/**
 * Convenience wrapper around `ensureDefaultLanguage` that's used by the
 * email-template render path — same lazy seeding, but the function
 * name reads more naturally at call sites that just need the id.
 */
export async function getDefaultLanguageId(): Promise<string> {
  return ensureDefaultLanguage();
}
