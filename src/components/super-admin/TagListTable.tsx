"use client";

import { useEffect, useRef, useState } from "react";

import { inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";
import type { ListTagsQuery } from "@/lib/validators";

export type TagRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  categories: Array<{ id: string; name: string }>;
  usageCount: number;
};

/**
 * Paginated tag list with a search box, sortable headers, inline
 * category chips that double as sidebar-scope shortcuts, per-row
 * edit/delete actions, and prev/next pagination.
 *
 * The component is intentionally controlled — every interaction
 * (search, sort, page, row click on a category chip, delete request,
 * new-tag click) is propagated to the parent as a callback so the
 * parent can write the URL, refresh server state, and update its
 * local cache.
 *
 * Search input is debounced ~300ms locally so typing doesn't issue a
 * URL push per keystroke; the parent receives the final value once
 * the user stops typing.
 */
export function TagListTable({
  tags,
  total,
  query,
  pending,
  rowError,
  onQueryChange,
  onChipClick,
  onCreate,
  onEdit,
  onDelete,
  onDismissError,
}: {
  tags: TagRow[];
  total: number;
  query: ListTagsQuery;
  pending: boolean;
  rowError: string | null;
  onQueryChange: (next: Partial<ListTagsQuery>) => void;
  onChipClick: (categoryId: string) => void;
  onCreate: () => void;
  onEdit: (tag: TagRow) => void;
  onDelete: (tag: TagRow) => void;
  onDismissError: () => void;
}) {
  const { t } = useTranslation();

  // Local search-input state so we can debounce. Re-syncs whenever the
  // URL-driven query changes (e.g. someone hits back/forward).
  const [searchInput, setSearchInput] = useState(query.q);
  const lastEmittedQ = useRef(query.q);

  useEffect(() => {
    setSearchInput(query.q);
    lastEmittedQ.current = query.q;
  }, [query.q]);

  useEffect(() => {
    if (searchInput === lastEmittedQ.current) return;
    const timer = setTimeout(() => {
      lastEmittedQ.current = searchInput;
      onQueryChange({ q: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onQueryChange]);

  function toggleSort(field: "name" | "usage") {
    if (query.sort === field) {
      onQueryChange({ order: query.order === "asc" ? "desc" : "asc" });
    } else {
      // Default direction depends on the field — name reads alphabetical
      // up; usage reads "most-used first" down.
      onQueryChange({
        sort: field,
        order: field === "name" ? "asc" : "desc",
        page: 1,
      });
    }
  }

  function sortIndicator(field: "name" | "usage") {
    if (query.sort !== field) return null;
    return (
      <span aria-hidden className="ml-1 text-xs">
        {query.order === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const showingFrom = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const showingTo = Math.min(query.page * query.pageSize, total);
  const canPrev = query.page > 1;
  const canNext = query.page < totalPages;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("super_admin.tags.search_placeholder")}
          className={inputClass + " sm:max-w-sm"}
        />
        <button
          type="button"
          onClick={onCreate}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t("super_admin.tags.new_tag")}
        </button>
      </div>

      {rowError && (
        <div className="flex items-start justify-between gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          <p>{rowError}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="text-xs underline"
          >
            {t("admin.action.dismiss")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="inline-flex items-center hover:text-slate-900 dark:hover:text-slate-200"
                >
                  {t("super_admin.tags.col.name")}
                  {sortIndicator("name")}
                </button>
              </th>
              <th className="px-4 py-3">{t("super_admin.tags.col.categories")}</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleSort("usage")}
                  className="inline-flex items-center hover:text-slate-900 dark:hover:text-slate-200"
                >
                  {t("super_admin.tags.col.usage")}
                  {sortIndicator("usage")}
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                {t("super_admin.tags.col.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {tags.map((tag) => (
              <tr key={tag.id}>
                <td className="px-4 py-3 font-medium">{tag.name}</td>
                <td className="px-4 py-3">
                  {tag.categories.length === 0 ? (
                    <span className="text-xs text-slate-400">
                      {t("super_admin.tags.no_categories")}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {tag.categories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onChipClick(c.id)}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          title={t("super_admin.tags.chip_title", { name: c.name })}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {tag.usageCount}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(tag)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {t("admin.action.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(tag)}
                      disabled={pending}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      {t("admin.action.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  {query.q.length > 0
                    ? t("super_admin.tags.empty.search")
                    : query.scope === "uncategorized"
                      ? t("super_admin.tags.empty.uncategorized")
                      : query.categoryId
                        ? t("super_admin.tags.empty.category")
                        : t("super_admin.tags.empty.catalog")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-start justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 sm:flex-row sm:items-center">
        <p>
          {t("super_admin.tags.pagination.showing", {
            from: showingFrom,
            to: showingTo,
            total,
          })}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onQueryChange({ page: query.page - 1 })}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t("super_admin.tags.pagination.prev")}
          </button>
          <span className="px-2">
            {t("super_admin.tags.pagination.page_of", {
              page: query.page,
              total: totalPages,
            })}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onQueryChange({ page: query.page + 1 })}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t("super_admin.tags.pagination.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
