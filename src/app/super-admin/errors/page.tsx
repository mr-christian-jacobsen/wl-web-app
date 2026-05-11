import { prisma } from "@/lib/db";
import { LOG_LEVELS, LOG_SOURCES } from "@/lib/log";
import { formatAdminTimestamp } from "@/lib/format";

import { LogEntriesTable } from "@/components/super-admin/LogEntriesTable";

const FILTER_OPTIONS: Array<{ label: string; level?: string; source?: string }> = [
  { label: "All" },
  { label: "Errors", level: "error" },
  { label: "Warnings", level: "warning" },
  { label: "Info", level: "info" },
  { label: "Server", source: "server" },
  { label: "Client", source: "client" },
];

export default async function SuperAdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; source?: string }>;
}) {
  const params = await searchParams;
  const where: { level?: string; source?: string } = {};
  if (params.level && (LOG_LEVELS as readonly string[]).includes(params.level)) {
    where.level = params.level;
  }
  if (params.source && (LOG_SOURCES as readonly string[]).includes(params.source)) {
    where.source = params.source;
  }

  const entries = await prisma.logEntry.findMany({
    where,
    orderBy: { lastOccurredAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, email: true } },
      session: {
        select: {
          id: true,
          os: true,
          osVersion: true,
          browser: true,
          browserVersion: true,
          deviceType: true,
          timezone: true,
          language: true,
        },
      },
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Logs</h2>
        <p className="text-sm text-slate-500">Showing {entries.length} most recent</p>
      </div>

      <nav className="flex flex-wrap gap-2 text-xs">
        {FILTER_OPTIONS.map((opt) => {
          const sp = new URLSearchParams();
          if (opt.level) sp.set("level", opt.level);
          if (opt.source) sp.set("source", opt.source);
          const href = sp.toString() ? `?${sp}` : "";
          const active =
            (params.level ?? null) === (opt.level ?? null) &&
            (params.source ?? null) === (opt.source ?? null);
          return (
            <a
              key={opt.label}
              href={`/super-admin/errors${href}`}
              className={
                "rounded-md border px-3 py-1.5 font-medium transition-colors " +
                (active
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              {opt.label}
            </a>
          );
        })}
      </nav>

      <LogEntriesTable
        entries={entries.map((e) => ({
          id: e.id,
          level: e.level,
          source: e.source,
          fingerprint: e.fingerprint,
          name: e.name,
          message: e.message,
          stack: e.stack,
          context: e.context,
          method: e.method,
          path: e.path,
          statusCode: e.statusCode,
          url: e.url,
          userAgent: e.userAgent,
          count: e.count,
          firstOccurredAtDisplay: formatAdminTimestamp(e.firstOccurredAt),
          lastOccurredAtDisplay: formatAdminTimestamp(e.lastOccurredAt),
          user: e.user ? { id: e.user.id, email: e.user.email } : null,
          session: e.session
            ? {
                id: e.session.id,
                os: e.session.os,
                osVersion: e.session.osVersion,
                browser: e.session.browser,
                browserVersion: e.session.browserVersion,
                deviceType: e.session.deviceType,
                timezone: e.session.timezone,
                language: e.session.language,
              }
            : null,
        }))}
      />
    </section>
  );
}
