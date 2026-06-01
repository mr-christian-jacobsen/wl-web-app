"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useTranslation } from "@/components/TranslationsProvider";
import {
  CategorySidebar,
  type CategoryRow,
  type SidebarScope,
} from "@/components/super-admin/CategorySidebar";
import {
  TagFormDialog,
  type TagFormCategory,
} from "@/components/super-admin/TagFormDialog";
import {
  TagListTable,
  type TagRow,
} from "@/components/super-admin/TagListTable";
import { buildTagsPageHref } from "@/lib/tags-page-url";
import type { ListTagsQuery } from "@/lib/validators";

type TagPage = {
  items: TagRow[];
  total: number;
  page: number;
  pageSize: number;
};

type TagFormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; tag: TagRow };

/**
 * Top-level client component for the tag catalog. Holds the local
 * mirror of categories + tags + query state, owns the inline tag
 * form, and orchestrates URL pushes + `router.refresh()` after every
 * write. URL is the source of truth — `initialQuery` arrives from the
 * server page, every `onQueryChange` writes the URL and re-fetches.
 *
 * Server-fetched props (`initialCategories`, `initialTagPage`) are
 * mirrored into local state so optimistic writes can update the UI
 * before the refresh round-trips; the `useEffect` re-sync below
 * adopts fresh props from any subsequent server render.
 *
 * Chip-on-row click hops back up to the sidebar via the shared
 * `setScope` path, keeping "click a chip → that category becomes the
 * active scope" consistent with explicit sidebar selection.
 *
 * "New tag" pre-checks the active category when scope is a specific
 * category — matches the synthesis call-out the user confirmed.
 */
export function TagsCatalog({
  initialCategories,
  initialTagPage,
  initialQuery,
}: {
  initialCategories: CategoryRow[];
  initialTagPage: TagPage;
  initialQuery: ListTagsQuery;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [categories, setCategories] =
    useState<CategoryRow[]>(initialCategories);
  const [tagPage, setTagPage] = useState<TagPage>(initialTagPage);
  const [query, setQuery] = useState<ListTagsQuery>(initialQuery);

  const [formMode, setFormMode] = useState<TagFormMode>({ kind: "closed" });
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Re-sync local state when the parent (a server component) hands us
  // fresh data after a `router.refresh()`. We skip the very first
  // render — `useState(initial)` already used the same reference —
  // and only adopt the prop on subsequent identity changes.
  const isFirstCategoriesRef = useRef(true);
  useEffect(() => {
    if (isFirstCategoriesRef.current) {
      isFirstCategoriesRef.current = false;
      return;
    }
    setCategories(initialCategories);
  }, [initialCategories]);

  const isFirstTagPageRef = useRef(true);
  useEffect(() => {
    if (isFirstTagPageRef.current) {
      isFirstTagPageRef.current = false;
      return;
    }
    setTagPage(initialTagPage);
  }, [initialTagPage]);

  const isFirstQueryRef = useRef(true);
  useEffect(() => {
    if (isFirstQueryRef.current) {
      isFirstQueryRef.current = false;
      return;
    }
    setQuery(initialQuery);
  }, [initialQuery]);

  /// Active scope derived from the URL query. Single source of truth
  /// lives in `query`; this just maps the URL shape into the sidebar's
  /// discriminated union for ergonomics.
  const activeScope: SidebarScope = useMemo(() => {
    if (query.scope === "uncategorized") return { kind: "uncategorized" };
    if (query.categoryId)
      return { kind: "category", categoryId: query.categoryId };
    return { kind: "all" };
  }, [query.scope, query.categoryId]);

  const formCategories: TagFormCategory[] = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name })),
    [categories],
  );

  /// Default category pre-check for "new tag" — when the sidebar is
  /// scoped to a specific category, pre-select it so the admin gets
  /// the obvious-next-tag scenario in one click.
  const createDefaultCategoryIds = useMemo<string[]>(() => {
    if (activeScope.kind === "category") return [activeScope.categoryId];
    return [];
  }, [activeScope]);

  /// Push a partial query update to the URL, then refresh server data.
  /// Sanitises mutually-exclusive fields on the way out so we don't
  /// emit a URL the validator would reject (and silently fall back to
  /// defaults).
  const onQueryChange = useCallback(
    (next: Partial<ListTagsQuery>) => {
      // Compute the merged query and href OUTSIDE of `setQuery` so the
      // router push runs in an event-handler context, not React's
      // render phase. Calling `startTransition` (or any state setter)
      // from inside a `setQuery` updater warns: "Cannot call
      // startTransition while rendering" in React 18+.
      const merged: ListTagsQuery = { ...query, ...next };
      if (merged.scope === "uncategorized") {
        merged.categoryId = undefined;
      }
      if (next.categoryId !== undefined && next.categoryId !== "") {
        merged.scope = "all";
      }
      const href = buildTagsPageHref(merged);
      setQuery(merged);
      startTransition(() => {
        router.push(href, { scroll: false });
        router.refresh();
      });
    },
    [router, query],
  );

  function onSelectScope(scope: SidebarScope) {
    if (scope.kind === "all") {
      onQueryChange({ scope: "all", categoryId: undefined, page: 1 });
    } else if (scope.kind === "uncategorized") {
      onQueryChange({ scope: "uncategorized", categoryId: undefined, page: 1 });
    } else {
      onQueryChange({
        scope: "all",
        categoryId: scope.categoryId,
        page: 1,
      });
    }
  }

  function onChipClick(categoryId: string) {
    onSelectScope({ kind: "category", categoryId });
  }

  function onCategoriesChanged(next: CategoryRow[]) {
    setCategories(next);
    startTransition(() => router.refresh());
  }

  function openCreate() {
    setFormError(null);
    setFormMode({ kind: "create" });
  }

  function openEdit(tag: TagRow) {
    setFormError(null);
    setFormMode({ kind: "edit", tag });
  }

  function closeForm() {
    setFormError(null);
    setFormMode({ kind: "closed" });
  }

  async function submitForm(payload: { name: string; categoryIds: string[] }) {
    setFormPending(true);
    setFormError(null);
    const isCreate = formMode.kind === "create";
    const editId = formMode.kind === "edit" ? formMode.tag.id : null;
    const url = isCreate
      ? "/api/super-admin/tags"
      : `/api/super-admin/tags/${editId}`;
    const res = await fetch(url, {
      method: isCreate ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setFormError(
        body?.error === "duplicate_name"
          ? t("super_admin.tags.duplicate_name")
          : (body?.error ?? t("super_admin.tags.save_failed")),
      );
      setFormPending(false);
      return;
    }
    const saved = (await res.json()) as TagRow;
    setTagPage((cur) => {
      if (isCreate) {
        // Optimistic insertion at the top of the visible page; the
        // server refresh below will re-order to canonical position
        // (and bump total accordingly).
        return {
          ...cur,
          items: [saved, ...cur.items],
          total: cur.total + 1,
        };
      }
      return {
        ...cur,
        items: cur.items.map((i) => (i.id === saved.id ? saved : i)),
      };
    });
    setFormPending(false);
    closeForm();
    startTransition(() => router.refresh());
  }

  async function deleteTag(tag: TagRow) {
    if (!confirm(t("super_admin.tags.delete_confirm", { name: tag.name }))) {
      return;
    }
    setRowError(null);
    const res = await fetch(`/api/super-admin/tags/${tag.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        surveyCount?: number;
      } | null;
      if (body?.error === "tag_in_use") {
        setRowError(
          t("super_admin.tags.delete_in_use", {
            n: body.surveyCount ?? 0,
            plural: body.surveyCount === 1 ? "" : "s",
          }),
        );
      } else {
        setRowError(body?.error ?? t("super_admin.tags.delete_failed"));
      }
      return;
    }
    setTagPage((cur) => ({
      ...cur,
      items: cur.items.filter((i) => i.id !== tag.id),
      total: Math.max(0, cur.total - 1),
    }));
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <CategorySidebar
        categories={categories}
        activeScope={activeScope}
        onSelect={onSelectScope}
        onCategoriesChanged={onCategoriesChanged}
      />
      <div className="flex flex-1 flex-col gap-4">
        {formMode.kind !== "closed" && (
          <TagFormDialog
            mode={formMode.kind}
            initialName={formMode.kind === "edit" ? formMode.tag.name : ""}
            initialCategoryIds={
              formMode.kind === "edit"
                ? formMode.tag.categories.map((c) => c.id)
                : createDefaultCategoryIds
            }
            categories={formCategories}
            pending={formPending}
            error={formError}
            onCancel={closeForm}
            onSubmit={submitForm}
          />
        )}
        <TagListTable
          tags={tagPage.items}
          total={tagPage.total}
          query={query}
          pending={false}
          rowError={rowError}
          onQueryChange={onQueryChange}
          onChipClick={onChipClick}
          onCreate={openCreate}
          onEdit={openEdit}
          onDelete={deleteTag}
          onDismissError={() => setRowError(null)}
        />
      </div>
    </div>
  );
}
