"use client";

import { useMemo, useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { flagEmoji, formatLocaleLabel, getLanguage } from "@/lib/locales";

export type LanguageRow = {
  id: string;
  countryCode: string;
  languageCode: string;
  isDefault: boolean;
  createdAt: string;
};

type CountryOption = {
  code: string;
  name: string;
  languages: string[];
};

export function LanguagesList({
  initial,
  countries,
}: {
  initial: LanguageRow[];
  countries: CountryOption[];
}) {
  const [rows, setRows] = useState<LanguageRow[]>(initial);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Selected country in the create form. We track it in state so the
  // language dropdown can react to it (auto-pick when there's only one
  // language; show the picker when there's more than one).
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("");

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  const country = useMemo(
    () => countries.find((c) => c.code === selectedCountry),
    [countries, selectedCountry],
  );

  // When the country has exactly one official language we hide the
  // language dropdown and treat that single language as the answer —
  // less clicking, no chance to pick something the dataset doesn't
  // know about.
  const autoLanguage = country && country.languages.length === 1 ? country.languages[0] : null;
  const effectiveLanguage = autoLanguage ?? selectedLanguage;

  function resetForm() {
    setSelectedCountry("");
    setSelectedLanguage("");
    setError(null);
  }

  function openForm() {
    resetForm();
    setCreating(true);
  }

  function closeForm() {
    resetForm();
    setCreating(false);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!country) {
      setError("Pick a country");
      return;
    }
    if (!effectiveLanguage) {
      setError("Pick a language");
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch("/api/super-admin/languages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        countryCode: country.code,
        languageCode: effectiveLanguage,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not add language");
      setPending(false);
      return;
    }
    const body = (await res.json()) as { language: LanguageRow };
    setRows((cur) => sortRows([...cur, body.language]));
    setPending(false);
    closeForm();
  }

  async function onDelete(row: LanguageRow) {
    const label = formatLocaleLabel(row.countryCode, row.languageCode);
    if (!confirm(`Delete ${label}?`)) return;
    setDeletingId(row.id);
    const res = await fetch(`/api/super-admin/languages/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not delete language");
      setDeletingId(null);
      return;
    }
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {rows.length === 0
            ? "No languages yet."
            : `${rows.length} language${rows.length === 1 ? "" : "s"}`}
        </p>
        {!creating && (
          <button
            type="button"
            onClick={openForm}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            New language
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <Field label="Country" htmlFor="lang-country">
            <select
              id="lang-country"
              required
              autoFocus
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setSelectedLanguage("");
                setError(null);
              }}
              className={inputClass}
            >
              <option value="">Select a country…</option>
              {sortedCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {flagEmoji(c.code)} {c.name}
                </option>
              ))}
            </select>
          </Field>

          {country && country.languages.length > 1 ? (
            <Field label="Language" htmlFor="lang-language">
              <select
                id="lang-language"
                required
                value={selectedLanguage}
                onChange={(e) => {
                  setSelectedLanguage(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              >
                <option value="">Select a language…</option>
                {country.languages.map((code) => (
                  <option key={code} value={code}>
                    {getLanguage(code)?.name ?? code}
                  </option>
                ))}
              </select>
            </Field>
          ) : country && autoLanguage ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Language: <span className="font-medium">{getLanguage(autoLanguage)?.name}</span>{" "}
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {country.code}-{autoLanguage}
              </span>
            </p>
          ) : null}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
              {pending ? "Adding…" : "Add language"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={pending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-2xl leading-none" aria-hidden>
                {flagEmoji(row.countryCode)}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">
                    {formatLocaleLabel(row.countryCode, row.languageCode)}
                  </span>
                  {row.isDefault && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {row.countryCode}-{row.languageCode}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {row.isDefault ? (
                <span
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-400 dark:border-slate-700"
                  title="The default language cannot be deleted"
                >
                  Locked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onDelete(row)}
                  disabled={deletingId === row.id}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {deletingId === row.id ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function sortRows(rows: LanguageRow[]): LanguageRow[] {
  return [...rows].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode);
    return a.languageCode.localeCompare(b.languageCode);
  });
}
