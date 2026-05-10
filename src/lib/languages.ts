import { prisma } from "@/lib/db";
import { DEFAULT_LANGUAGE } from "@/lib/locales";

/**
 * Make sure the seeded default Language row exists. Called from the
 * `/super-admin/languages` page and the list API so the table always
 * shows English even on a fresh database — no separate seed script.
 *
 * The unique `(countryCode, languageCode)` constraint means this is a
 * cheap upsert; we never overwrite the row, only set `isDefault = true`
 * if it had drifted to false.
 */
export async function ensureDefaultLanguage(): Promise<void> {
  await prisma.language.upsert({
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
  });
}
