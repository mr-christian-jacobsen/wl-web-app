import { LanguagesList, type LanguageRow } from "@/components/super-admin/LanguagesList";
import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";
import { COUNTRIES } from "@/lib/locales";
import { getServerT } from "@/lib/translations.server";

export default async function LanguagesPage() {
  const t = await getServerT();
  await ensureDefaultLanguage();

  const languages = await prisma.language.findMany({
    select: {
      id: true,
      countryCode: true,
      languageCode: true,
      isDefault: true,
      createdAt: true,
    },
    orderBy: [{ isDefault: "desc" }, { countryCode: "asc" }, { languageCode: "asc" }],
  });

  const initial: LanguageRow[] = languages.map((l) => ({
    id: l.id,
    countryCode: l.countryCode,
    languageCode: l.languageCode,
    isDefault: l.isDefault,
    createdAt: l.createdAt.toISOString(),
  }));

  // Pass only the data we need to the client — strip `name` lookups
  // server-side so the bundle is small.
  const countries = COUNTRIES.map((c) => ({
    code: c.code,
    name: c.name,
    languages: c.languages,
  }));

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("super_admin.languages.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.languages.description")}
        </p>
      </div>
      <LanguagesList initial={initial} countries={countries} />
    </section>
  );
}
