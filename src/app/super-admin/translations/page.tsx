import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";
import { listTranslationsForAdmin } from "@/lib/translations.server";

import { TranslationsEditor } from "@/components/super-admin/TranslationsEditor";

/**
 * `/super-admin/translations` — list every translation key and let the
 * admin edit values for one language at a time. Editing only; no delete
 * (per requirements — keys are managed in code, values follow).
 *
 * Server component: reads the available languages + the rows for the
 * picked language and hands a flat list to the client editor.
 */
export default async function SuperAdminTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const defaultLanguageId = await ensureDefaultLanguage();

  const languages = await prisma.language.findMany({
    orderBy: [{ isDefault: "desc" }, { countryCode: "asc" }, { languageCode: "asc" }],
    select: {
      id: true,
      countryCode: true,
      languageCode: true,
      isDefault: true,
    },
  });

  // Default the editor to the site default unless the URL says otherwise
  // and the requested language actually exists.
  const requested = params.lang;
  const selectedLanguageId =
    requested && languages.some((l) => l.id === requested)
      ? requested
      : defaultLanguageId;

  const rows = await listTranslationsForAdmin(selectedLanguageId);

  return (
    <TranslationsEditor
      languages={languages}
      selectedLanguageId={selectedLanguageId}
      defaultLanguageId={defaultLanguageId}
      initialRows={rows}
    />
  );
}
