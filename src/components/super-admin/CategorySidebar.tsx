"use client";

import { useEffect, useMemo, useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  tagCount: number;
};

export type SidebarScope =
  | { kind: "all" }
  | { kind: "uncategorized" }
  | { kind: "category"; categoryId: string };

type EditState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "editing"; row: CategoryRow };

/**
 * Sidebar listing the categories with their tag counts. Layout pins
 * "All tags" at the top and "Uncategorized" at the bottom, with the
 * named categories sorted alphabetically between them — per the
 * resolved deferred decision in the U6 brief.
 *
 * Owns its own create/edit inline forms and POST/PATCH/DELETE calls
 * to `/api/super-admin/categories`. After every write the parent's
 * `onCategoriesChanged` callback fires so it can update its local
 * cache and call `router.refresh()`.
 */
export function CategorySidebar({
  categories,
  activeScope,
  onSelect,
  onCategoriesChanged,
}: {
  categories: CategoryRow[];
  activeScope: SidebarScope;
  onSelect: (scope: SidebarScope) => void;
  onCategoriesChanged: (next: CategoryRow[]) => void;
}) {
  const { t } = useTranslation();
  const [editState, setEditState] = useState<EditState>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const allCount = useMemo(
    () => categories.reduce((acc, c) => acc + c.tagCount, 0),
    [categories],
  );

  function startCreate() {
    setError(null);
    setEditState({ kind: "creating" });
  }

  function startEdit(row: CategoryRow) {
    setError(null);
    setEditState({ kind: "editing", row });
  }

  function closeForm() {
    setError(null);
    setEditState({ kind: "idle" });
  }

  async function handleCreate(input: { name: string; description: string }) {
    setPending(true);
    setError(null);
    const res = await fetch("/api/super-admin/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        description: input.description || undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        body?.error === "duplicate_name"
          ? t("super_admin.tags.categories.duplicate_name")
          : (body?.error ?? t("super_admin.tags.categories.create_failed")),
      );
      setPending(false);
      return;
    }
    const created = (await res.json()) as CategoryRow;
    onCategoriesChanged([...categories, created]);
    setPending(false);
    closeForm();
  }

  async function handleUpdate(
    row: CategoryRow,
    input: { name: string; description: string },
  ) {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/super-admin/categories/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        // Send null to clear; send the trimmed value otherwise.
        description: input.description.length > 0 ? input.description : undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        body?.error === "duplicate_name"
          ? t("super_admin.tags.categories.duplicate_name")
          : (body?.error ?? t("super_admin.tags.categories.update_failed")),
      );
      setPending(false);
      return;
    }
    const updated = (await res.json()) as Omit<CategoryRow, "tagCount">;
    onCategoriesChanged(
      categories.map((c) =>
        c.id === row.id ? { ...c, ...updated, tagCount: row.tagCount } : c,
      ),
    );
    setPending(false);
    closeForm();
  }

  async function handleDelete(row: CategoryRow) {
    const confirmMsg = t("super_admin.tags.categories.delete_confirm", {
      name: row.name,
      n: row.tagCount,
      plural: row.tagCount === 1 ? "" : "s",
    });
    if (!confirm(confirmMsg)) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/super-admin/categories/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? t("super_admin.tags.categories.delete_failed"));
      setPending(false);
      return;
    }
    onCategoriesChanged(categories.filter((c) => c.id !== row.id));
    // If the deleted category was the active scope, drop back to "all".
    if (
      activeScope.kind === "category" &&
      activeScope.categoryId === row.id
    ) {
      onSelect({ kind: "all" });
    }
    setPending(false);
  }

  const isAllActive = activeScope.kind === "all";
  const isUncategorizedActive = activeScope.kind === "uncategorized";

  return (
    <aside className="flex w-full flex-col gap-3 lg:w-64 lg:shrink-0">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("super_admin.tags.categories.title")}
        </h3>
        {editState.kind === "idle" && (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t("super_admin.tags.categories.new")}
          </button>
        )}
      </div>

      {editState.kind === "creating" && (
        <CategoryForm
          mode="create"
          initial={{ name: "", description: "" }}
          pending={pending}
          error={error}
          onCancel={closeForm}
          onSubmit={handleCreate}
        />
      )}

      <ul className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SidebarRow
          label={t("super_admin.tags.scope.all")}
          count={allCount}
          active={isAllActive}
          onClick={() => onSelect({ kind: "all" })}
        />

        {sortedCategories.map((c) => {
          const isActive =
            activeScope.kind === "category" && activeScope.categoryId === c.id;
          const isEditing =
            editState.kind === "editing" && editState.row.id === c.id;
          return (
            <li key={c.id} className="border-t border-slate-200 dark:border-slate-800">
              {isEditing ? (
                <div className="p-3">
                  <CategoryForm
                    mode="edit"
                    initial={{
                      name: editState.row.name,
                      description: editState.row.description ?? "",
                    }}
                    pending={pending}
                    error={error}
                    onCancel={closeForm}
                    onSubmit={(input) => handleUpdate(c, input)}
                  />
                </div>
              ) : (
                <div className="group flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({ kind: "category", categoryId: c.id })
                    }
                    className={
                      "flex flex-1 items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 " +
                      (isActive
                        ? "bg-slate-900 text-white hover:bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-white"
                        : "")
                    }
                    title={c.description ?? undefined}
                  >
                    <span className="truncate">{c.name}</span>
                    <span
                      className={
                        "ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs " +
                        (isActive
                          ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")
                      }
                    >
                      {c.tagCount}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      disabled={pending}
                      className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {t("admin.action.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      disabled={pending}
                      className="rounded-md border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      {t("admin.action.delete")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}

        <li className="border-t border-slate-200 dark:border-slate-800">
          <SidebarRow
            label={t("super_admin.tags.scope.uncategorized")}
            count={null}
            active={isUncategorizedActive}
            onClick={() => onSelect({ kind: "uncategorized" })}
          />
        </li>
      </ul>

      {/* Surface delete-by-row errors outside the inline forms (the form's
          own error state covers create/edit). */}
      {error && editState.kind === "idle" && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </aside>
  );
}

function SidebarRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 " +
        (active
          ? "bg-slate-900 text-white hover:bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-white"
          : "")
      }
    >
      <span className="font-medium">{label}</span>
      {count !== null && (
        <span
          className={
            "ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs " +
            (active
              ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

function CategoryForm({
  mode,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial: { name: string; description: string };
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: { name: string; description: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);

  useEffect(() => {
    setName(initial.name);
    setDescription(initial.description);
  }, [initial.name, initial.description]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({ name: name.trim(), description: description.trim() });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <Field label={t("super_admin.tags.categories.field.name")} htmlFor="cat-name">
        <input
          id="cat-name"
          autoFocus
          required
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field
        label={t("super_admin.tags.categories.field.description")}
        htmlFor="cat-description"
      >
        <textarea
          id="cat-description"
          maxLength={280}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </Field>
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
              ? t("super_admin.tags.categories.create_submit")
              : t("super_admin.tags.categories.update_submit")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t("admin.action.cancel")}
        </button>
      </div>
    </form>
  );
}
