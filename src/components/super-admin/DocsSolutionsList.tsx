"use client";

import { useMemo, useState } from "react";

import type { SolutionRow } from "@/app/super-admin/docs-solutions/page";
import { useTranslation } from "@/components/TranslationsProvider";

/**
 * Browse / filter UI for `/super-admin/docs-solutions`.
 *
 * Filtering is purely client-side over the pre-fetched array (the
 * corpus is small enough that round-trips would be wasted work). The
 * three filter axes are independent: an active problem-type filter,
 * an active status filter, and a tag set; rows must satisfy all
 * three to render.
 *
 * Server provides `problemTypes` (from KNOWN_PROBLEM_TYPES) and
 * `tags` (from KNOWN_TAGS) so the dropdowns / chips can render the
 * full registry even when no current row uses an entry — this
 * makes the page consistent with the catalog and helps surface
 * reserved-but-unused entries during review.
 */

const ALL = "__all__" as const;
type FilterValue = string | typeof ALL;

export function DocsSolutionsList({
  initial,
  problemTypes,
  tags,
}: {
  initial: SolutionRow[];
  problemTypes: string[];
  tags: string[];
}) {
  const { t } = useTranslation();

  const [problemType, setProblemType] = useState<FilterValue>(ALL);
  const [status, setStatus] = useState<FilterValue>(ALL);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());

  const sortedProblemTypes = useMemo(
    () => [...problemTypes].sort((a, b) => a.localeCompare(b)),
    [problemTypes],
  );
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.localeCompare(b)),
    [tags],
  );

  const rows = useMemo(() => {
    return initial.filter((r) => {
      if (problemType !== ALL && r.problemType !== problemType) return false;
      if (status !== ALL && r.status !== status) return false;
      if (selectedTags.size > 0) {
        // Doc must carry every selected tag (AND-match — narrows fast at
        // small corpus sizes and produces a predictable count).
        for (const tag of selectedTags) {
          if (!r.tags.includes(tag)) return false;
        }
      }
      return true;
    });
  }, [initial, problemType, status, selectedTags]);

  // Map id → row for supersedes/superseded_by link rendering. Only
  // rows currently visible after filtering are eligible link targets —
  // if a target is hidden, the id renders as plain text instead of
  // jumping the reader to nothing.
  const visibleById = useMemo(() => {
    const m = new Map<string, SolutionRow>();
    for (const r of rows) if (r.id) m.set(r.id, r);
    return m;
  }, [rows]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function clearTags() {
    setSelectedTags(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Filter strip ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
          <span>{t("super_admin.docs_solutions.column.problem_type")}</span>
          <select
            value={problemType}
            onChange={(e) => setProblemType(e.target.value as FilterValue)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value={ALL}>
              {t("super_admin.docs_solutions.filters.all_problem_types")}
            </option>
            {sortedProblemTypes.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
          <span>{t("super_admin.docs_solutions.column.status")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FilterValue)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value={ALL}>
              {t("super_admin.docs_solutions.filters.all_statuses")}
            </option>
            <option value="active">active</option>
            <option value="superseded">superseded</option>
            <option value="archived">archived</option>
          </select>
        </label>

        <div className="ml-auto text-xs text-slate-500">
          {rows.length} / {initial.length}
        </div>
      </div>

      {/* ─── Tag chips ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {t("super_admin.docs_solutions.filters.tags_label")}
          </span>
          {selectedTags.size > 0 ? (
            <button
              type="button"
              onClick={clearTags}
              className="text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              {t("super_admin.docs_solutions.filters.clear_tags")}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sortedTags.map((tag) => {
            const active = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={active}
                className={
                  "rounded-full border px-2 py-0.5 text-xs transition-colors " +
                  (active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800")
                }
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Results table ────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.id")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.title")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.category")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.problem_type")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.status")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.tags")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.date")}</th>
              <th className="px-3 py-2">{t("super_admin.docs_solutions.column.source")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  {t("super_admin.docs_solutions.empty")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.path}
                  id={r.id ?? undefined}
                  className="border-t border-slate-100 align-top hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/40"
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                    {r.id ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {r.title ?? "—"}
                    </div>
                    <SupersedesLine row={r} visibleById={visibleById} t={t} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.category ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.problemType ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.date ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.sourceUrl ? (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                      >
                        {r.path}
                      </a>
                    ) : (
                      <span className="font-mono text-slate-500 dark:text-slate-500">
                        {r.path}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-500">—</span>;
  const className = (() => {
    switch (status) {
      case "active":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "superseded":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
      case "archived":
        return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
      default:
        return "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400";
    }
  })();
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

function SupersedesLine({
  row,
  visibleById,
  t,
}: {
  row: SolutionRow;
  visibleById: Map<string, SolutionRow>;
  t: (key: string) => string;
}) {
  const items: { label: string; ids: string[] }[] = [];
  if (row.supersededBy) {
    items.push({
      label: t("super_admin.docs_solutions.superseded_by.label"),
      ids: [row.supersededBy],
    });
  }
  if (row.supersedes.length > 0) {
    items.push({
      label: t("super_admin.docs_solutions.supersedes.label"),
      ids: row.supersedes,
    });
  }
  if (items.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
      {items.map((item) => (
        <div key={item.label}>
          <span className="font-medium">{item.label}:</span>{" "}
          {item.ids.map((id, i) => {
            const target = visibleById.get(id);
            return (
              <span key={id}>
                {i > 0 ? ", " : null}
                {target ? (
                  <a
                    href={`#${id}`}
                    className="font-mono underline hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    {id}
                  </a>
                ) : (
                  <span className="font-mono text-slate-400 dark:text-slate-500">
                    {id}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
