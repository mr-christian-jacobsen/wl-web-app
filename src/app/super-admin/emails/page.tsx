import { prisma } from "@/lib/db";

const TYPE_LABELS: Record<string, string> = {
  user_invitation: "User invitation",
  email_verification: "Email verification",
  password_reset: "Password reset",
  email_change_confirmation: "Email change",
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  skipped: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {emails.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                  {e.sentAt.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div>{e.to}</div>
                  {e.user && e.user.email !== e.to && (
                    <div className="text-xs text-slate-500">user: {e.user.email}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs">
                    {TYPE_LABELS[e.type] ?? e.type}
                  </span>
                  {!e.templateKey && (
                    <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      fallback
                    </span>
                  )}
                </td>
                <td className="max-w-md px-4 py-3 text-slate-700 dark:text-slate-200">
                  <div className="truncate" title={e.subject}>
                    {e.subject}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[e.status] ?? STATUS_BADGE.pending}`}
                  >
                    {e.status}
                  </span>
                  {e.error && (
                    <div className="mt-1 max-w-xs truncate text-xs text-red-600" title={e.error}>
                      {e.error}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {emails.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No emails sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
