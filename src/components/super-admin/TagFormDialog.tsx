"use client";

import { useEffect, useMemo, useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

export type TagFormCategory = { id: string; name: string };

/**
 * Inline create/edit form for a tag. Despite the "Dialog" name, this
 * is rendered inline above the table (matches the LanguagesList
 * convention — no modal libraries in this codebase). Mounted when
 * the parent flips its mode to "create" or "edit" and dismissed on
 * save or cancel.
 *
 * For create mode, `initialCategoryIds` carries the pre-check — when
 * the sidebar is scoped to a specific category, the parent passes
 * that category's id so the admin sees the obvious-next-tag scenario
 * with one less click. They can uncheck it if they don't want it.
 */
export function TagFormDialog({
  mode,
  initialName,
  initialCategoryIds,
  categories,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialName: string;
  initialCategoryIds: string[];
  categories: TagFormCategory[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: { name: string; categoryIds: string[] }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialCategoryIds),
  );

  // Re-sync local state when the parent swaps which tag is being
  // edited (mode changes from edit-A to edit-B without unmounting).
  useEffect(() => {
    setName(initialName);
    setSelectedIds(new Set(initialCategoryIds));
  }, [initialName, initialCategoryIds]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  function toggleCategory(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      categoryIds: Array.from(selectedIds),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {mode === "create"
          ? t("super_admin.tags.form.create_title")
          : t("super_admin.tags.form.edit_title")}
      </h3>

      <Field label={t("super_admin.tags.form.name")} htmlFor="tag-name">
        <input
          id="tag-name"
          name="name"
          autoFocus
          required
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          {t("super_admin.tags.form.categories_label")}
        </legend>
        {sortedCategories.length === 0 ? (
          <p className="text-xs text-slate-500">
            {t("super_admin.tags.form.no_categories")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {sortedCategories.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleCategory(c.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className={buttonClass + " sm:w-auto"}
        >
          {pending
            ? t("admin.action.saving")
            : mode === "create"
              ? t("super_admin.tags.form.create_submit")
              : t("super_admin.tags.form.edit_submit")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t("admin.action.cancel")}
        </button>
      </div>
    </form>
  );
}
