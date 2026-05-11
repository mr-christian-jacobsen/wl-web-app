"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type LogEntryRow = {
  id: string;
  level: string;
  source: string;
  fingerprint: string;
  name: string | null;
  message: string;
  stack: string | null;
  context: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  url: string | null;
  userAgent: string | null;
  count: number;
  firstOccurredAtDisplay: string;
  lastOccurredAtDisplay: string;
  user: { id: string; email: string } | null;
  session: {
    id: string;
    os: string | null;
    osVersion: string | null;
    browser: string | null;
    browserVersion: string | null;
    deviceType: string | null;
    timezone: string | null;
    language: string | null;
  } | null;
};

const LEVEL_BADGE: Record<string, string> = {
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

const SOURCE_BADGE: Record<string, string> = {
  server: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  client: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

export function LogEntriesTable({ entries: initial }: { entries: LogEntryRow[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selected = selectedId ? entries.find((e) => e.id === selectedId) ?? null : null;

  function onDelete(entry: LogEntryRow) {
    if (!confirm(`Delete this log entry? (${entry.count}× occurrences)`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/super-admin/errors/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Delete failed");
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setSelectedId(null);
      router.refresh();
    });
  }

  return (
    <>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {entries.map((e) => (
              <tr
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className="cursor-pointer align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                  {e.lastOccurredAtDisplay}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${LEVEL_BADGE[e.level] ?? LEVEL_BADGE.info}`}
                  >
                    {e.level}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${SOURCE_BADGE[e.source] ?? ""}`}
                  >
                    {e.source}
                  </span>
                </td>
                <td className="max-w-md px-4 py-3 text-slate-700 dark:text-slate-200">
                  {e.name && <span className="font-mono text-xs text-slate-500">{e.name}: </span>}
                  <span className="line-clamp-2" title={e.message}>
                    {e.message}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                  {e.count > 1 ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800">
                      {e.count}×
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">1</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {e.user ? (
                    <span className="text-xs">{e.user.email}</span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No log entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <LogEntryDialog
          entry={selected}
          pending={pending}
          onClose={() => setSelectedId(null)}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

function LogEntryDialog({
  entry,
  pending,
  onClose,
  onDelete,
}: {
  entry: LogEntryRow;
  pending: boolean;
  onClose: () => void;
  onDelete: (entry: LogEntryRow) => void;
}) {
  const prettyContext = entry.context ? prettifyJson(entry.context) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${LEVEL_BADGE[entry.level] ?? LEVEL_BADGE.info}`}
              >
                {entry.level}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${SOURCE_BADGE[entry.source] ?? ""}`}
              >
                {entry.source}
              </span>
              {entry.count > 1 && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800">
                  {entry.count}× occurrences
                </span>
              )}
            </div>
            <h3 className="mt-2 break-words text-lg font-semibold">
              {entry.name && (
                <span className="font-mono text-base text-slate-500">{entry.name}: </span>
              )}
              {entry.message}
            </h3>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onDelete(entry)}
              disabled={pending}
              className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold text-slate-500">First seen</dt>
          <dd>{entry.firstOccurredAtDisplay}</dd>
          <dt className="font-semibold text-slate-500">Last seen</dt>
          <dd>{entry.lastOccurredAtDisplay}</dd>
          {entry.method && (
            <>
              <dt className="font-semibold text-slate-500">Request</dt>
              <dd className="break-all font-mono">
                {entry.method} {entry.path ?? ""}
                {entry.statusCode ? ` → ${entry.statusCode}` : ""}
              </dd>
            </>
          )}
          {entry.url && (
            <>
              <dt className="font-semibold text-slate-500">URL</dt>
              <dd className="break-all">{entry.url}</dd>
            </>
          )}
          {entry.userAgent && (
            <>
              <dt className="font-semibold text-slate-500">User agent</dt>
              <dd className="break-all">{entry.userAgent}</dd>
            </>
          )}
          {entry.user && (
            <>
              <dt className="font-semibold text-slate-500">User</dt>
              <dd className="break-all">{entry.user.email}</dd>
            </>
          )}
          {entry.session && (
            <>
              <dt className="font-semibold text-slate-500">Device</dt>
              <dd>{describeSession(entry.session)}</dd>
              {entry.session.timezone && (
                <>
                  <dt className="font-semibold text-slate-500">Timezone</dt>
                  <dd>{entry.session.timezone}</dd>
                </>
              )}
              {entry.session.language && (
                <>
                  <dt className="font-semibold text-slate-500">Language</dt>
                  <dd>{entry.session.language}</dd>
                </>
              )}
            </>
          )}
          <dt className="font-semibold text-slate-500">Fingerprint</dt>
          <dd className="break-all font-mono">{entry.fingerprint}</dd>
        </dl>

        {entry.stack && (
          <details className="rounded-md border border-slate-200 dark:border-slate-800" open>
            <summary className="cursor-pointer bg-slate-50 px-3 py-2 text-xs font-semibold dark:bg-slate-950">
              Stack trace
            </summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed">
              {entry.stack}
            </pre>
          </details>
        )}

        {prettyContext && (
          <details className="rounded-md border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer bg-slate-50 px-3 py-2 text-xs font-semibold dark:bg-slate-950">
              Context
            </summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed">
              {prettyContext}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function prettifyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function describeSession(s: NonNullable<LogEntryRow["session"]>): string {
  const parts: string[] = [];
  if (s.browser) parts.push(s.browserVersion ? `${s.browser} ${s.browserVersion}` : s.browser);
  if (s.os) parts.push(s.osVersion ? `${s.os} ${s.osVersion}` : s.os);
  if (s.deviceType) parts.push(`(${s.deviceType})`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
