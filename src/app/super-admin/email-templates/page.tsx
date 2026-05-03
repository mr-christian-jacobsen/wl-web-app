import { prisma } from "@/lib/db";

import { EmailTemplatesTable } from "@/components/super-admin/EmailTemplatesTable";

export default async function SuperAdminEmailTemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Email templates</h2>
        <p className="text-sm text-slate-500">{templates.length} total</p>
      </div>
      <EmailTemplatesTable
        initialTemplates={templates.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        }))}
      />
    </section>
  );
}
