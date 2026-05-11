"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useTranslation } from "@/components/TranslationsProvider";
import { flagEmoji, formatLocaleLabel } from "@/lib/locales";

export type TranslationRowView = {
  keyId: string;
  key: string;
  name: string;
  description: string | null;
  translationId: string | null;
  /** Current value for the selected language, or null when no row yet. */
  value: string | null;
  /** "human" | "auto" | null when no row exists yet. */
  source: string | null;
  /** Code-side English default, used as the placeholder when value is empty. */
  defaultValue: string;
  /** Value in the site's default language, when different from the selected one. */
  defaultLanguageValue: string | null;
};

type LanguageView = {
  id: string;
  countryCode: string;
  languageCode: string;
  isDefault: boolean;
};

type BulkStatus =
  | { kind: "idle" }
  | { kind: "running"; mode: "review" | "commit" }
  | { kind: "ok"; mode: "review" | "commit"; count: number }
  | { kind: "err"; msg: string };

export function TranslationsEditor({
  languages,
  selectedLanguageId,
  defaultLanguageId,
  initialRows,
}: {
  languages: LanguageView[];
  selectedLanguageId: string;
  defaultLanguageId: string;
  initialRows: TranslationRowView[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  // Pending suggestions, keyed by TranslationKey id, that the user has
  // not yet saved. Per-row textareas show these when present.
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [syncStatus, setSyncStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; upserted: number; defaultsInserted: number }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });
  const [bulkStatus, setBulkStatus] = useState<BulkStatus>({ kind: "idle" });

  const isDefaultLanguage = selectedLanguageId === defaultLanguageId;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.key.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.value ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter]);

  function onChangeLanguage(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", nextId);
    startTransition(() => {
      router.replace(`/super-admin/translations?${params.toString()}`);
    });
  }

  async function onSync() {
    setSyncStatus({ kind: "running" });
    const res = await fetch("/api/super-admin/translations/sync", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setSyncStatus({ kind: "err", msg: body?.error ?? "Sync failed" });
      return;
    }
    const body = (await res.json()) as { upserted: number; defaultsInserted: number };
    setSyncStatus({ kind: "ok", ...body });
    router.refresh();
  }

  // Bulk: "Translate all missing" — either to review (commit=false,
  // suggestions fill textareas) or auto-commit (commit=true, source="auto"
  // rows land in the DB and the row table re-rendered to match).
  async function onBulkTranslate(mode: "review" | "commit") {
    setBulkStatus({ kind: "running", mode });
    const res = await fetch("/api/super-admin/translations/auto-translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        languageId: selectedLanguageId,
        scope: "missing",
        commit: mode === "commit",
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setBulkStatus({ kind: "err", msg: body?.error ?? "Auto-translate failed" });
      return;
    }
    const body = (await res.json()) as {
      items: Array<{ keyId: string; key: string; translation: string }>;
    };

    if (mode === "review") {
      // Fill textareas; admin reviews and clicks Save row-by-row.
      setSuggestions((cur) => {
        const next = { ...cur };
        for (const it of body.items) next[it.keyId] = it.translation;
        return next;
      });
    } else {
      // Already committed server-side. Update local row state.
      setRows((cur) =>
        cur.map((r) => {
          const hit = body.items.find((it) => it.keyId === r.keyId);
          return hit ? { ...r, value: hit.translation, source: "auto" } : r;
        }),
      );
    }
    setBulkStatus({ kind: "ok", mode, count: body.items.length });
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("super_admin.translations.title")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.translations.description")}
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1 sm:w-72">
          <label htmlFor="language" className="text-sm font-medium">
            {t("super_admin.translations.language_label")}
          </label>
          <select
            id="language"
            value={selectedLanguageId}
            disabled={isPending}
            onChange={(e) => onChangeLanguage(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {flagEmoji(l.countryCode)} {formatLocaleLabel(l.countryCode, l.languageCode)}
                {l.isDefault ? " — Default" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("super_admin.translations.search_placeholder")}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950 sm:w-72"
          />
          <button
            type="button"
            onClick={onSync}
            disabled={syncStatus.kind === "running"}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {syncStatus.kind === "running"
              ? t("super_admin.translations.saving")
              : t("super_admin.translations.sync_button")}
          </button>
        </div>
      </div>

      {!isDefaultLanguage && (
        <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {t("super_admin.translations.auto.heading")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onBulkTranslate("review")}
              disabled={bulkStatus.kind === "running"}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {bulkStatus.kind === "running" && bulkStatus.mode === "review"
                ? t("super_admin.translations.auto.running")
                : t("super_admin.translations.auto.missing_review")}
            </button>
            <button
              type="button"
              onClick={() => onBulkTranslate("commit")}
              disabled={bulkStatus.kind === "running"}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {bulkStatus.kind === "running" && bulkStatus.mode === "commit"
                ? t("super_admin.translations.auto.running")
                : t("super_admin.translations.auto.missing_commit")}
            </button>
          </div>
        </div>
      )}

      {bulkStatus.kind === "ok" && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          {bulkStatus.mode === "review"
            ? t("super_admin.translations.auto.review_ok")
            : t("super_admin.translations.auto.commit_ok")}{" "}
          ({bulkStatus.count})
        </p>
      )}
      {bulkStatus.kind === "err" && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {bulkStatus.msg}
        </p>
      )}

      {syncStatus.kind === "ok" && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          Synced {syncStatus.upserted} key{syncStatus.upserted === 1 ? "" : "s"} from code (
          {syncStatus.defaultsInserted} new default-language row
          {syncStatus.defaultsInserted === 1 ? "" : "s"} inserted).
        </p>
      )}
      {syncStatus.kind === "err" && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {syncStatus.msg}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          {t("super_admin.translations.empty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">{t("super_admin.translations.col.key")}</th>
                <th className="px-4 py-3">{t("super_admin.translations.col.name")}</th>
                <th className="px-4 py-3">{t("super_admin.translations.col.value")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((row) => (
                <Row
                  key={row.keyId}
                  row={row}
                  suggestion={suggestions[row.keyId]}
                  clearSuggestion={() =>
                    setSuggestions((cur) => {
                      if (!(row.keyId in cur)) return cur;
                      const next = { ...cur };
                      delete next[row.keyId];
                      return next;
                    })
                  }
                  selectedLanguageId={selectedLanguageId}
                  isDefaultLanguage={isDefaultLanguage}
                  onSaved={(updated) =>
                    setRows((cur) =>
                      cur.map((r) =>
                        r.keyId === row.keyId
                          ? {
                              ...r,
                              value: updated.value,
                              translationId: updated.id,
                              source: updated.source,
                            }
                          : r,
                      ),
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({
  row,
  suggestion,
  clearSuggestion,
  selectedLanguageId,
  isDefaultLanguage,
  onSaved,
}: {
  row: TranslationRowView;
  suggestion: string | undefined;
  clearSuggestion: () => void;
  selectedLanguageId: string;
  isDefaultLanguage: boolean;
  onSaved: (next: { id: string; value: string; source: string }) => void;
}) {
  const { t } = useTranslation();
  // Draft tracks what's currently in the textarea. Initial value:
  // suggestion (if bulk filled one) → existing DB value → empty.
  const [draft, setDraft] = useState(suggestion ?? row.value ?? "");
  // Track whether the textarea is currently showing an unsaved AI suggestion
  // (so we can render the "auto-translated" hint until the admin saves).
  const [showingSuggestion, setShowingSuggestion] = useState(suggestion !== undefined);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "translating" }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });

  // When a bulk suggestion arrives for THIS row after mount, fold it in.
  // useEffect avoided to keep the component simple; instead we compare on
  // each render: if a suggestion exists and the draft hasn't been edited
  // since the row was created, sync.
  if (suggestion !== undefined && !showingSuggestion && draft !== suggestion) {
    setDraft(suggestion);
    setShowingSuggestion(true);
  }

  const placeholder =
    !isDefaultLanguage && row.defaultLanguageValue
      ? row.defaultLanguageValue
      : row.defaultValue;

  const dirty = draft !== (row.value ?? "");

  async function save() {
    setStatus({ kind: "saving" });
    const res = await fetch("/api/super-admin/translations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        translationKeyId: row.keyId,
        languageId: selectedLanguageId,
        value: draft,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Save failed" });
      return;
    }
    const body = (await res.json()) as {
      translation: { id: string; value: string; source: string };
    };
    onSaved(body.translation);
    setShowingSuggestion(false);
    clearSuggestion();
    setStatus({ kind: "saved" });
  }

  async function translateOne() {
    if (isDefaultLanguage) return;
    setStatus({ kind: "translating" });
    const res = await fetch("/api/super-admin/translations/auto-translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        languageId: selectedLanguageId,
        scope: { keyIds: [row.keyId] },
        commit: false,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Translate failed" });
      return;
    }
    const body = (await res.json()) as {
      items: Array<{ keyId: string; translation: string }>;
    };
    const hit = body.items.find((it) => it.keyId === row.keyId);
    if (!hit) {
      setStatus({ kind: "err", msg: "No translation returned" });
      return;
    }
    setDraft(hit.translation);
    setShowingSuggestion(true);
    setStatus({ kind: "idle" });
  }

  // Source badge logic:
  // - showingSuggestion (unsaved AI fill): pending-auto chip
  // - row.source === "auto" (saved AI value, no further edits): saved-auto chip
  // - row.source === "human" or null: nothing
  const sourceBadge = showingSuggestion ? (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {t("super_admin.translations.auto.suggestion_badge")}
    </span>
  ) : row.source === "auto" ? (
    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-200">
      {t("super_admin.translations.auto.saved_badge")}
    </span>
  ) : null;

  return (
    <tr className="align-top">
      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
        <div className="break-all">{row.key}</div>
      </td>
      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
        <div className="font-medium">{row.name}</div>
        {row.description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.description}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // Manually editing dismisses the suggestion banner.
              if (showingSuggestion) setShowingSuggestion(false);
              if (status.kind === "saved" || status.kind === "err") setStatus({ kind: "idle" });
            }}
            placeholder={placeholder}
            rows={Math.max(2, Math.ceil(draft.length / 80) || 2)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-200"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {sourceBadge}
              {row.value === null && !showingSuggestion && (
                <span className="text-slate-500 dark:text-slate-400">
                  {t("super_admin.translations.fallback_notice")}
                </span>
              )}
              {status.kind === "saved" && (
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                  {t("super_admin.translations.saved")}
                </span>
              )}
              {status.kind === "err" && (
                <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-200">
                  {status.msg}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isDefaultLanguage && (
                <button
                  type="button"
                  onClick={translateOne}
                  disabled={status.kind === "translating" || status.kind === "saving"}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {status.kind === "translating"
                    ? t("super_admin.translations.auto.translating")
                    : t("super_admin.translations.auto.translate_row")}
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={!dirty || status.kind === "saving" || status.kind === "translating"}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {status.kind === "saving"
                  ? t("super_admin.translations.saving")
                  : t("super_admin.translations.save")}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
