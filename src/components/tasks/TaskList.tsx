"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { useTranslation } from "@/components/TranslationsProvider";

/**
 * `/tasks` list component (R10, R19, R20).
 *
 * Server fetches the user's pending + completed TaskInstances and
 * passes them grouped. This component renders pending rows expanded
 * with a "Mark complete" action, and the completed rows inside a
 * collapsed `<details>` summarised by row count.
 *
 * Optimistic UI: clicking Mark complete immediately moves the row from
 * the pending list to the completed list. On error the row is restored
 * and an inline error message appears for that row. We use `useState`
 * for the list arrays and `useTransition` to debounce per-row pending
 * state so React batches the in-flight UI correctly.
 *
 * Each pending row may expose a deep-link target derived from the
 * task's predicate (e.g. `avatar_present` → `/profile`). The path is
 * passed down from the server via `deepLinkPath`; the registry lookup
 * stays on the server so we don't ship `KNOWN_PREDICATES` to the
 * client.
 */

export type TaskListItem = {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  /** Resolved from `KNOWN_PREDICATES[task.predicateKey]?.deepLinkPath` on the server. */
  deepLinkPath: string | null;
  /** ISO timestamps for stable sort and display. */
  createdAt: string;
  completedAt: string | null;
};

type Props = {
  pending: TaskListItem[];
  completed: TaskListItem[];
};

export function TaskList({ pending: initialPending, completed: initialCompleted }: Props) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<TaskListItem[]>(initialPending);
  const [completed, setCompleted] = useState<TaskListItem[]>(initialCompleted);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  async function markComplete(item: TaskListItem) {
    // Optimistic move first — the request runs in the background and
    // the row only reverts if the server actually rejects.
    setErrors((e) => {
      if (!e[item.id]) return e;
      const next = { ...e };
      delete next[item.id];
      return next;
    });
    setBusy((b) => ({ ...b, [item.id]: true }));
    setPending((cur) => cur.filter((row) => row.id !== item.id));
    const optimisticCompleted: TaskListItem = {
      ...item,
      completedAt: new Date().toISOString(),
    };
    setCompleted((cur) => [optimisticCompleted, ...cur]);

    try {
      const res = await fetch(`/api/tasks/${item.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        // 409 (already completed) is a benign race — the optimistic
        // move was correct in the end. For any other status we revert
        // and surface the error inline.
        if (res.status !== 409) {
          startTransition(() => {
            setCompleted((cur) => cur.filter((row) => row.id !== item.id));
            setPending((cur) =>
              [...cur, item].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
            );
            setErrors((e) => ({ ...e, [item.id]: t("tasks.mark_complete_failed") }));
          });
        }
      }
    } catch {
      startTransition(() => {
        setCompleted((cur) => cur.filter((row) => row.id !== item.id));
        setPending((cur) =>
          [...cur, item].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        );
        setErrors((e) => ({ ...e, [item.id]: t("tasks.mark_complete_failed") }));
      });
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[item.id];
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("tasks.section.pending")}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">
              {t("tasks.empty.title")}
            </p>
            <p className="mt-1">{t("tasks.empty.body")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {item.description}
                    </p>
                  )}
                  {item.deepLinkPath && (
                    <Link
                      href={item.deepLinkPath}
                      className="self-start text-sm font-medium text-slate-700 underline-offset-4 hover:underline dark:text-slate-300"
                    >
                      {t("tasks.deep_link")} {item.deepLinkPath}
                    </Link>
                  )}
                  {errors[item.id] && (
                    <p className="text-xs text-red-600">{errors[item.id]}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => markComplete(item)}
                  disabled={busy[item.id] === true}
                  className="self-start rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {t("tasks.mark_complete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <details className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
            <span>{t("tasks.section.completed")}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("tasks.completed.count", { n: completed.length })}
            </span>
          </summary>
          {completed.length > 0 && (
            <ul className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              {completed.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-slate-700 dark:text-slate-300">
                    {item.title}
                  </span>
                  {item.completedAt && (
                    <time
                      dateTime={item.completedAt}
                      className="shrink-0 text-xs text-slate-500 dark:text-slate-400"
                    >
                      {new Date(item.completedAt).toLocaleDateString()}
                    </time>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
    </div>
  );
}
