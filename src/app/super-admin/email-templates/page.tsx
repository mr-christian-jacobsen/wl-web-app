import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";

import { EmailTemplatesTable } from "@/components/super-admin/EmailTemplatesTable";

export default async function SuperAdminEmailTemplatesPage() {
  // Make sure the default Language row exists so the editor always has a
  // valid `languageId` to default the create form to.
  const defaultLanguageId = await ensureDefaultLanguage();

  const [templates, languages] = await Promise.all([
    prisma.emailTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        key: true,
        languageId: true,
        name: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.language.findMany({
      orderBy: [{ isDefault: "desc" }, { countryCode: "asc" }, { languageCode: "asc" }],
      select: {
        id: true,
        countryCode: true,
        languageCode: true,
        isDefault: true,
      },
    }),
  ]);

  return (
    <EmailTemplatesTable
      initialTemplates={templates.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
      languages={languages}
      defaultLanguageId={defaultLanguageId}
    />
  );
}
