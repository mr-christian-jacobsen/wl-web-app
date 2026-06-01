"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

/**
 * Admin task definition list (U7). Mirrors `SurveysList` for the inline-
 * create + per-row delete pattern; the editor lives at
 * `/super-admin/tasks/[id]`.
 *
 * "Quick create" submits a minimal definition (title + a single
 * `signup` trigger) so the admin lands in the full editor immediately
 * after creation to wire up triggers and predicate. The plan flagged
 * the inline create as deferred-UX-decision; a default signup trigger
 * is the safest pre-filled shape because every other trigger requires
 * config (intervalDays / dates).
 */

type TaskSummary = {
  id: string;
  title: string;
  description: string | null;
  predicateKey: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  instanceCount: number;
  triggerCount: number;
};

export function TasksList({ initial }: { initial: TaskSummary[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/super-admin/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        description: data.description || undefined,
        // Default to a signup trigger — the admin will refine in the
        // editor. Without at least one trigger the validator rejects.
        triggers: [{ kind: "signup" }],
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? t("super_admin.tasks.create_failed"));
      setPending(false);
      return;
    }
    const body = (await res.json()) as { task: TaskSummary };
    setTasks((cur) => [body.task, ...cur]);
    setCreating(false);
    setPending(false);
    router.push(`/super-admin/tasks/${body.task.id}`);
  }

  async function onDelete(id: string, title: string) {
    if (!confirm(t("super_admin.tasks.delete_confirm", { title }))) return;
    setDeletingId(id);
    const res = await fetch(`/api/super-admin/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? t("super_admin.tasks.delete_failed"));
      setDeletingId(null);
      return;
    }
    setTasks((cur) => cur.filter((s) => s.id !== id));
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {tasks.length === 0
            ? t("super_admin.tasks.empty")
            : t("super_admin.users.total", { n: tasks.length })}
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setError(null);
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {t("super_admin.tasks.new")}
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <Field label={t("super_admin.tasks.dialog.title_label")} htmlFor="task-title">
            <input
              id="task-title"
              name="title"
              required
              maxLength={160}
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field
            label={t("super_admin.tasks.dialog.description_label")}
            htmlFor="task-description"
          >
            <textarea
              id="task-description"
              name="description"
              rows={3}
              maxLength={4000}
              className={inputClass}
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
              {pending
                ? t("admin.action.saving")
                : t("super_admin.tasks.dialog.create")}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("admin.action.cancel")}
            </button>
          </div>
        </form>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("super_admin.tasks.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <Link
                href={`/super-admin/tasks/${task.id}`}
                className="flex min-w-0 flex-1 flex-col gap-1 hover:opacity-80"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-medium">{task.title}</span>
                  <EnabledBadge enabled={task.enabled} />
                </span>
                {task.description && (
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">
                    {task.description}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {t("super_admin.tasks.row.counts", {
                    instances: task.instanceCount,
                    triggers: task.triggerCount,
                  })}{" "}
                  · updated {new Date(task.updatedAt).toLocaleDateString()}
                </span>
              </Link>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/super-admin/tasks/${task.id}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {t("admin.action.edit")}
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(task.id, task.title)}
                  disabled={deletingId === task.id}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {deletingId === task.id
                    ? t("admin.action.deleting")
                    : t("admin.action.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  return enabled ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
      {t("super_admin.tasks.status.enabled")}
    </span>
  ) : (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
      {t("super_admin.tasks.status.disabled")}
    </span>
  );
}
