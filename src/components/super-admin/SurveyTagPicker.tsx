"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { buttonClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";
import { uniqueTagIdsInGroups, type TagPickerGroup } from "@/lib/tag-picker";

/**
 * Inline tag-picker section for the survey editor (U7). Renders one
 * `<fieldset>` per category in the supplied `groups`, plus a final
 * "Uncategorized" group, and a single "Save tags" button that
 * bulk-replaces the survey's attachments via U5's PUT endpoint.
 *
 * Local state holds a `Set<string>` of selected tag ids; when a tag
 * appears in two categories both checkboxes derive from the same Set
 * entry so toggling either flips the other automatically (the
 * single-underlying-state requirement from R12).
 */
export function SurveyTagPicker({
  initialTagIds,
  groups,
  surveyId,
}: {
  initialTagIds: string[];
  groups: TagPickerGroup[];
  surveyId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    () => new Set(initialTagIds),
  );
  const [savedTagIds, setSavedTagIds] = useState<Set<string>>(
    () => new Set(initialTagIds),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Catalog-wide list of tag ids that actually exist in any group —
  // used so the dirty-check ignores selections for tags that have
  // already been deleted from the catalog between page load and save.
  const knownTagIds = useMemo(
    () => new Set(uniqueTagIdsInGroups(groups)),
    [groups],
  );

  const isEmptyCatalog = groups.every((g) => g.tags.length === 0);
  const dirty = useMemo(
    () => !setsEqual(filterToKnown(selectedTagIds, knownTagIds), savedTagIds),
    [selectedTagIds, savedTagIds, knownTagIds],
  );

  function toggle(tagId: string) {
    setSelectedTagIds((cur) => {
      const next = new Set(cur);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
    // Stop showing the green "Saved" pill the moment the user touches
    // anything — same shape as the details section's idle/ok/err
    // status, simplified to a boolean since we only flash on success.
    setSavedFlash(false);
    setError(null);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSavedFlash(false);
    const tagIds = Array.from(selectedTagIds);
    const res = await fetch(`/api/super-admin/surveys/${surveyId}/tags`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (res.status === 400 && body?.error === "unknown_tag_ids") {
        setError(t("super_admin.tags.picker.unknown_tag_ids"));
      } else {
        setError(t("super_admin.tags.picker.save_failed"));
      }
      setSaving(false);
      return;
    }
    setSavedTagIds(new Set(tagIds));
    setSavedFlash(true);
    setSaving(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">
          {t("super_admin.tags.picker.section_title")}
        </h2>
        <p className="text-sm text-slate-500">
          {t("super_admin.tags.picker.summary", { n: selectedTagIds.size })}
        </p>
      </div>

      {isEmptyCatalog ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("super_admin.tags.picker.empty_state")}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {groups.map((group) => {
            if (group.tags.length === 0) return null;
            const legend =
              group.category?.name ??
              t("super_admin.tags.picker.uncategorized_group");
            const fieldsetKey = group.category?.id ?? "__uncategorized__";
            return (
              <fieldset
                key={fieldsetKey}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <legend className="px-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {legend}
                </legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {group.tags.map((tag) => {
                    const checkboxId = `tag-${fieldsetKey}-${tag.id}`;
                    return (
                      <label
                        key={tag.id}
                        htmlFor={checkboxId}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={selectedTagIds.has(tag.id)}
                          onChange={() => toggle(tag.id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 dark:border-slate-600"
                        />
                        <span>{tag.name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className={buttonClass + " sm:w-auto"}
        >
          {saving
            ? t("super_admin.tags.picker.saving")
            : t("super_admin.tags.picker.save")}
        </button>
        {savedFlash && !error && (
          <span className="text-sm text-emerald-700">
            {t("super_admin.tags.picker.saved")}
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Drop ids that aren't in the catalog anymore — so a tag deleted in
 * another tab between page load and save doesn't permanently mark the
 * picker as "dirty". The save call itself still sends every id the
 * user has checked; the server-side `unknown_tag_ids` 400 is the
 * authoritative check.
 */
function filterToKnown(selected: Set<string>, known: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const id of selected) {
    if (known.has(id)) out.add(id);
  }
  return out;
}
