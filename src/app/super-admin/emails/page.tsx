import { prisma } from "@/lib/db";
import { formatEmailSentAt } from "@/lib/format";

import { EmailsTable } from "@/components/super-admin/EmailsTable";

export default async function SuperAdminEmailsPage() {
  const emails = await prisma.email.findMany({
    orderBy: { sentAt: "desc" },
    take: 200,
    include: { user: { select: { id: true, email: true } } },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Emails</h2>
        <p className="text-sm text-slate-500">Showing {emails.length} most recent</p>
      </div>

      <EmailsTable
        emails={emails.map((e) => ({
          id: e.id,
          to: e.to,
          type: e.type,
          templateKey: e.templateKey,
          subject: e.subject,
          bodyText: e.bodyText,
          bodyHtml: e.bodyHtml,
          status: e.status,
          error: e.error,
          sentAtDisplay: formatEmailSentAt(e.sentAt),
          user: e.user ? { id: e.user.id, email: e.user.email } : null,
        }))}
      />
    </section>
  );
}
