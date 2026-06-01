"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

/**
 * Admin global instance overview table (U8 — R23, R24). Mirrors the
 * `usage` / `errors` admin page conventions for filters + tabular
 * rendering, with two write paths added on top:
 *
 *   - "Mark complete" per pending row → confirm dialog → POST to the
 *     U8 admin complete endpoint → optimistic UI moves the row.
 *   - "Assign task" header button → dialog picks a task definition +
 *     user ID → POST to the U4 manual-assign endpoint → prepend the
 *     created instance to the list.
 *
 * Filter state lives in the URL via search params so admins can deep-
 * link. Status changes are pushed via `router.push` which the parent
 * server component reads on the next render — the table also
 * imperatively re-fetches via the API so the UI updates without
 * waiting for SSR.
 *
 * Pagination: simple "Load more" button that appends the next page in
 * place. Cursor format mirrors the API: `<createdAtIso>_<id>`.
 *
 * Per the plan, user-typeahead UX is a deferred follow-up — for v1
 * the user filter is a plain ID input (debounced submit-on-change).
 * The plan accepts this and flags the typeahead as Phase D
 * follow-up scope.
 */

export type InstanceRow = {
  id: string;
  taskId: string;
  userId: string;
  status: string;
  source: string | null;
  signature: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignedByAdminId: string | null;
  completedByAdminId: string | null;
  user: { id: string; email: string; name: string };
  task: { id: string; title: string };
};

type Filters = {
  userId: string;
  taskId: string;
  status: string;
};

type TaskOption = { id: string; title: string };

export function AdminInstanceTable({
  initialInstances,
  initialNextCursor,
  initialFilters,
  tasks,
}: {
  initialInstances: InstanceRow[];
  initialNextCursor: string | null;
  initialFilters: Filters;
  tasks: TaskOption[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState<InstanceRow[]>(initialInstances);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Push a filter change up to the URL so refresh / share-link works,
  // then refetch the first page. We don't optimistically clear rows —
  // the in-flight indicator is enough and the rows stay stable until
  // the new page lands.
  const applyFilters = useCallback(
    (next: Filters) => {
      setFilters(next);
      const sp = new URLSearchParams();
      if (next.userId) sp.set("userId", next.userId);
      if (next.taskId) sp.set("taskId", next.taskId);
      if (next.status) sp.set("status", next.status);
      const qs = sp.toString();
      const newUrl = qs ? `?${qs}` : "";
      startTransition(() => {
        router.push(`/super-admin/tasks/instances${newUrl}`);
      });
      void refetch(next, null);
    },
    [router],
  );

  const refetch = useCallback(
    async (current: Filters, cursor: string | null) => {
      setLoadingMore(true);
      setError(null);
      const sp = new URLSearchParams();
      if (current.userId) sp.set("userId", current.userId);
      if (current.taskId) sp.set("taskId", current.taskId);
      if (current.status) sp.set("status", current.status);
      if (cursor) sp.set("cursor", cursor);
      const res = await fetch(`/api/super-admin/tasks/instances?${sp}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? t("super_admin.task_instances.error.load_failed"));
        setLoadingMore(false);
        return;
      }
      const body = (await res.json()) as {
        instances: InstanceRow[];
        nextCursor: string | null;
      };
      setRows((cur) => (cursor ? [...cur, ...body.instances] : body.instances));
      setNextCursor(body.nextCursor);
      setLoadingMore(false);
    },
    [t],
  );

  const onMarkComplete = useCallback(
    async (row: InstanceRow) => {
      const confirmed = window.confirm(
        t("super_admin.task_instances.confirm_complete", {
          title: row.task.title,
          email: row.user.email,
        }),
      );
      if (!confirmed) return;
      setCompletingId(row.id);
      setError(null);
      const res = await fetch(
        `/api/super-admin/tasks/instances/${row.id}/complete`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? t("super_admin.task_instances.error.complete_failed"));
        setCompletingId(null);
        return;
      }
      const body = (await res.json()) as { instance: InstanceRow };
      // Optimistic merge: keep all other columns from the original row
      // (the response shape doesn't include `user` / `task` includes)
      // but flip status/source/completedAt + the admin attribution
      // column.
      setRows((cur) =>
        cur.map((r) =>
          r.id === row.id
            ? {
                ...r,
                status: body.instance.status,
                source: body.instance.source,
                completedAt: body.instance.completedAt,
                completedByAdminId: body.instance.completedByAdminId,
              }
            : r,
        ),
      );
      setCompletingId(null);
    },
    [t],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Field
            label={t("super_admin.task_instances.filter.user_label")}
            htmlFor="filter-user"
          >
            <input
              id="filter-user"
              type="text"
              value={filters.userId}
              placeholder={t("super_admin.task_instances.filter.user_placeholder")}
              onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
              onBlur={() => applyFilters(filters)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyFilters(filters);
                }
              }}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("super_admin.task_instances.filter.task_label")}
            htmlFor="filter-task"
          >
            <select
              id="filter-task"
              value={filters.taskId}
              onChange={(e) =>
                applyFilters({ ...filters, taskId: e.target.value })
              }
              className={inputClass}
            >
              <option value="">{t("super_admin.task_instances.filter.task_all")}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("super_admin.task_instances.filter.status_label")}
            htmlFor="filter-status"
          >
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) =>
                applyFilters({ ...filters, status: e.target.value })
              }
              className={inputClass}
            >
              <option value="">{t("super_admin.task_instances.filter.status_all")}</option>
              <option value="pending">
                {t("super_admin.task_instances.status.pending")}
              </option>
              <option value="completed">
                {t("super_admin.task_instances.status.completed")}
              </option>
            </select>
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t("super_admin.task_instances.assign_button")}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">{t("super_admin.task_instances.col.user")}</th>
              <th className="px-4 py-3">{t("super_admin.task_instances.col.task")}</th>
              <th className="px-4 py-3">{t("super_admin.task_instances.col.status")}</th>
              <th className="px-4 py-3">{t("super_admin.task_instances.col.source")}</th>
              <th className="px-4 py-3">{t("super_admin.task_instances.col.created")}</th>
              <th className="px-4 py-3">{t("super_admin.task_instances.col.completed")}</th>
              <th className="px-4 py-3 text-right">
                {t("super_admin.task_instances.col.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{row.user.name}</div>
                  <div className="text-xs text-slate-500">{row.user.email}</div>
                </td>
                <td className="px-4 py-3">{row.task.title}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {row.source ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                  {row.completedAt
                    ? new Date(row.completedAt).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => onMarkComplete(row)}
                      disabled={completingId === row.id}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {completingId === row.id
                        ? t("super_admin.task_instances.completing")
                        : t("super_admin.task_instances.mark_complete")}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {t("super_admin.task_instances.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => refetch(filters, nextCursor)}
            disabled={loadingMore}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {loadingMore
              ? t("super_admin.task_instances.loading_more")
              : t("super_admin.task_instances.load_more")}
          </button>
        </div>
      )}

      {assignOpen && (
        <AssignDialog
          tasks={tasks}
          onClose={() => setAssignOpen(false)}
          onAssigned={(created) => {
            // Refetch instead of optimistic insert — the new instance
            // lacks the `user` / `task` include shape the table needs,
            // and a refetch is cheap. The previous filters are
            // preserved so the admin keeps their view.
            setAssignOpen(false);
            void refetch(filters, null);
            // searchParams reference is read so React doesn't warn about
            // unused hook; the URL doesn't change on assign-success.
            void searchParams;
            void created;
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "completed") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
        {t("super_admin.task_instances.status.completed")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-100">
      {t("super_admin.task_instances.status.pending")}
    </span>
  );
}

function AssignDialog({
  tasks,
  onClose,
  onAssigned,
}: {
  tasks: TaskOption[];
  onClose: () => void;
  onAssigned: (created: { id: string }) => void;
}) {
  const { t } = useTranslation();
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!taskId || !userId.trim()) {
      setError(t("super_admin.task_instances.assign.error.missing_fields"));
      return;
    }
    setPending(true);
    const res = await fetch(`/api/super-admin/tasks/${taskId}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: userId.trim() }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? t("super_admin.task_instances.assign.error.failed"));
      setPending(false);
      return;
    }
    const body = (await res.json()) as { instance: { id: string } };
    onAssigned(body.instance);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 className="text-lg font-semibold tracking-tight">
          {t("super_admin.task_instances.assign.title")}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.task_instances.assign.subtitle")}
        </p>
        <Field
          label={t("super_admin.task_instances.assign.task_label")}
          htmlFor="assign-task"
        >
          <select
            id="assign-task"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className={inputClass}
            required
          >
            {tasks.length === 0 && (
              <option value="" disabled>
                {t("super_admin.task_instances.assign.task_empty")}
              </option>
            )}
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t("super_admin.task_instances.assign.user_label")}
          htmlFor="assign-user"
        >
          <input
            id="assign-user"
            type="text"
            value={userId}
            placeholder={t("super_admin.task_instances.assign.user_placeholder")}
            onChange={(e) => setUserId(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || tasks.length === 0}
            className={buttonClass + " sm:w-auto"}
          >
            {pending
              ? t("admin.action.saving")
              : t("super_admin.task_instances.assign.submit")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t("admin.action.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
