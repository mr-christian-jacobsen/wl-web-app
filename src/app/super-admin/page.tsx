import Link from "next/link";

import { prisma } from "@/lib/db";

export default async function SuperAdminLanding() {
  const since24h = new Date(Date.now() - 24 * 60 * 60_000);
  const [totalUsers, superAdmins, templates, sessions24h, emails24h, errors24h] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isSuperAdmin: true } }),
      prisma.emailTemplate.count(),
      prisma.usageSession.count({ where: { startedAt: { gte: since24h } } }),
      prisma.email.count({
        where: { status: "sent", sentAt: { gte: since24h } },
      }),
      // Distinct error fingerprints last seen in the last 24h. The table on
      // /super-admin/errors uses the same `lastOccurredAt` for its sort, so the
      // number here matches what an admin would see at the top of that list.
      prisma.logEntry.count({
        where: { level: "error", lastOccurredAt: { gte: since24h } },
      }),
    ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Total users" value={totalUsers} />
        <Stat label="Super admins" value={superAdmins} />
        <Stat label="Email templates" value={templates} />
        <Stat label="Sessions (24h)" value={sessions24h} />
        <Stat label="Emails (24h)" value={emails24h} />
        <Stat label="Errors (24h)" value={errors24h} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link
              href="/super-admin/users"
              className="font-medium text-slate-900 underline dark:text-slate-100"
            >
              Manage users →
            </Link>
          </li>
          <li>
            <Link
              href="/super-admin/email-templates"
              className="font-medium text-slate-900 underline dark:text-slate-100"
            >
              Manage email templates →
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
