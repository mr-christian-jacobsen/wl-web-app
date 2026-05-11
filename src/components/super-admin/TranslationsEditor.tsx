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
  const [filter, setFilter] = useState("");
  const [syncStatus, setSyncStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; upserted: number; defaultsInserted: number }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });

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
    const res = await fetch("/api/super-admin/translations/sync", {
      method: "POST",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setSyncStatus({ kind: "err", msg: body?.error ?? "Sync failed" });
      return;
    }
    const body = (await res.json()) as { upserted: number; defaultsInserted: number };
    setSyncStatus({ kind: "ok", ...body });
    // Refresh server props so any newly-added keys show up.
    router.refresh();
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
                  selectedLanguageId={selectedLanguageId}
                  isDefaultLanguage={selectedLanguageId === defaultLanguageId}
                  onSaved={(updated) =>
                    setRows((cur) =>
                      cur.map((r) =>
                        r.keyId === row.keyId
                          ? { ...r, value: updated.value, translationId: updated.id }
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
  selectedLanguageId,
  isDefaultLanguage,
  onSaved,
}: {
  row: TranslationRowView;
  selectedLanguageId: string;
  isDefaultLanguage: boolean;
  onSaved: (next: { id: string; value: string }) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(row.value ?? "");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });

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
    const body = (await res.json()) as { translation: { id: string; value: string } };
    onSaved(body.translation);
    setStatus({ kind: "saved" });
  }

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
              if (status.kind === "saved" || status.kind === "err") setStatus({ kind: "idle" });
            }}
            placeholder={placeholder}
            rows={Math.max(2, Math.ceil(draft.length / 80) || 2)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-200"
          />
          {row.value === null && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("super_admin.translations.fallback_notice")}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs">
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
            <button
              type="button"
              onClick={save}
              disabled={!dirty || status.kind === "saving"}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {status.kind === "saving"
                ? t("super_admin.translations.saving")
                : t("super_admin.translations.save")}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
