import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60_000;

function fmtDateTime(d: Date) {
  return d.toLocaleString();
}

function deviceLabel(s: {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: string | null;
}) {
  const browser = [s.browser, s.browserVersion?.split(".")[0]].filter(Boolean).join(" ");
  const os = [s.os, s.osVersion].filter(Boolean).join(" ");
  const parts = [browser, os, s.deviceType].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function durationLabel(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
}

export default async function SuperAdminUsagePage() {
  const since7d = new Date(Date.now() - 7 * DAY_MS);
  const since24h = new Date(Date.now() - DAY_MS);

  const [total7d, total24h, distinctUsers7d, recent] = await Promise.all([
    prisma.usageSession.count({ where: { startedAt: { gte: since7d } } }),
    prisma.usageSession.count({ where: { startedAt: { gte: since24h } } }),
    prisma.usageSession
      .findMany({ where: { startedAt: { gte: since7d } }, distinct: ["userId"], select: { userId: true } })
      .then((rows) => rows.length),
    prisma.usageSession.findMany({
      orderBy: { lastActiveAt: "desc" },
      take: 100,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sessions (last 24h)" value={total24h} />
        <Stat label="Sessions (last 7d)" value={total7d} />
        <Stat label="Active users (last 7d)" value={distinctUsers7d} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Screen</th>
              <th className="px-4 py-3">Locale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {recent.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{s.user.name}</div>
                  <div className="text-xs text-slate-500">{s.user.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {fmtDateTime(s.startedAt)}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {fmtDateTime(s.lastActiveAt)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {durationLabel(s.startedAt, s.lastActiveAt)}
                </td>
                <td className="px-4 py-3">{deviceLabel(s)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {s.screenWidth && s.screenHeight ? `${s.screenWidth}×${s.screenHeight}` : "—"}
                  {s.viewportWidth && s.viewportHeight ? (
                    <div className="text-xs text-slate-500">
                      vp {s.viewportWidth}×{s.viewportHeight}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  <div>{s.language ?? "—"}</div>
                  <div className="text-xs text-slate-500">{s.timezone ?? ""}</div>
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No usage recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
