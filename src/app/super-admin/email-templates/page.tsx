import { prisma } from "@/lib/db";

import { EmailTemplatesTable } from "@/components/super-admin/EmailTemplatesTable";

export default async function SuperAdminEmailTemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <EmailTemplatesTable
      initialTemplates={templates.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
