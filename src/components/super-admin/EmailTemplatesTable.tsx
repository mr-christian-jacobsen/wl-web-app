"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { flagEmoji, formatLocaleLabel } from "@/lib/locales";
import {
  KNOWN_TEMPLATES,
  type RenderedTemplate,
  type TemplateVars,
  escapeHtml,
  renderFallback,
  renderTemplate,
} from "@/lib/templates";

export type EmailTemplate = {
  id: string;
  key: string;
  languageId: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LanguageRow = {
  id: string;
  countryCode: string;
  languageCode: string;
  isDefault: boolean;
};

type TemplatePrefill = {
  key: string;
  keyLocked: boolean;
  languageId: string;
  languageLocked: boolean;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  description: string;
};

type Mode =
  | { kind: "idle" }
  | { kind: "create"; prefill?: TemplatePrefill }
  | { kind: "edit"; template: EmailTemplate };

type PreviewState = {
  key: string;
  languageId: string | null;
  source: "defined" | "fallback";
  rendered: RenderedTemplate;
};

const textareaClass = inputClass + " font-mono text-xs leading-relaxed";

function humanizeKey(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderDefinedTemplate(tpl: EmailTemplate, vars: TemplateVars): RenderedTemplate {
  return {
    subject: renderTemplate(tpl.subject, vars),
    text: renderTemplate(tpl.bodyText, vars),
    html: tpl.bodyHtml ? renderTemplate(tpl.bodyHtml, vars, escapeHtml) : null,
  };
}

export function EmailTemplatesTable({
  initialTemplates,
  languages,
  defaultLanguageId,
}: {
  initialTemplates: EmailTemplate[];
  languages: LanguageRow[];
  defaultLanguageId: string;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const languagesById = useMemo(
    () => new Map(languages.map((l) => [l.id, l])),
    [languages],
  );

  function refresh(next: EmailTemplate[]) {
    setTemplates(next);
    router.refresh();
  }

  function templatesForKey(key: string): EmailTemplate[] {
    return templates.filter((t) => t.key === key);
  }

  function languagesWithoutTemplate(key: string): LanguageRow[] {
    const definedLangs = new Set(templatesForKey(key).map((t) => t.languageId));
    return languages.filter((l) => !definedLangs.has(l.id));
  }

  function openCreateForKnown(key: string, languageId: string) {
    setError(null);
    const known = KNOWN_TEMPLATES.find((t) => t.key === key);
    if (!known) return;
    setMode({
      kind: "create",
      prefill: {
        key: known.key,
        keyLocked: true,
        languageId,
        languageLocked: true,
        name: humanizeKey(known.key),
        subject: known.fallback.subject,
        bodyText: known.fallback.bodyText,
        bodyHtml: known.fallback.bodyHtml,
        description: known.description,
      },
    });
  }

  function openCreateBlank() {
    setError(null);
    setMode({
      kind: "create",
      prefill: {
        key: "",
        keyLocked: false,
        languageId: defaultLanguageId,
        languageLocked: false,
        name: "",
        subject: "",
        bodyText: "",
        bodyHtml: "",
        description: "",
      },
    });
  }

  function openPreviewForKnown(key: string, languageId: string | null) {
    const known = KNOWN_TEMPLATES.find((t) => t.key === key);
    if (!known) return;
    const vars = known.sampleVars as TemplateVars;
    if (languageId) {
      const existing = templates.find((t) => t.key === key && t.languageId === languageId);
      if (existing) {
        setPreview({
          key,
          languageId,
          source: "defined",
          rendered: renderDefinedTemplate(existing, vars),
        });
        return;
      }
    }
    const rendered = renderFallback(key, vars);
    if (rendered) {
      setPreview({ key, languageId: null, source: "fallback", rendered });
    }
  }

  function openPreviewForRow(row: EmailTemplate) {
    const known = KNOWN_TEMPLATES.find((t) => t.key === row.key);
    const vars = (known?.sampleVars ?? {}) as TemplateVars;
    setPreview({
      key: row.key,
      languageId: row.languageId,
      source: "defined",
      rendered: renderDefinedTemplate(row, vars),
    });
  }

  async function onDelete(t: EmailTemplate) {
    const lang = languagesById.get(t.languageId);
    const label = lang ? formatLocaleLabel(lang.countryCode, lang.languageCode) : t.languageId;
    if (!confirm(`Delete "${t.key}" (${label})? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/super-admin/email-templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Delete failed");
        return;
      }
      refresh(templates.filter((x) => x.id !== t.id));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">Templates the app uses</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          These keys are referenced from code. Each entry can have one row per language; the
          send pipeline picks the requested language, falling back to the default and finally
          the built-in copy.
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {KNOWN_TEMPLATES.map((t) => {
            const rows = templatesForKey(t.key);
            const missing = languagesWithoutTemplate(t.key);
            return (
              <li
                key={t.key}
                className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <code className="font-mono text-xs">{t.key}</code>
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-xs " +
                          (rows.length > 0
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200")
                        }
                      >
                        {rows.length === 0
                          ? "fallback"
                          : `${rows.length} language${rows.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">{t.description}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      vars: {t.variables.map((v) => `{{${v}}}`).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:self-center">
                    <button
                      type="button"
                      onClick={() => openPreviewForKnown(t.key, null)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Preview fallback
                    </button>
                  </div>
                </div>

                {rows.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {rows
                      .slice()
                      .sort((a, b) => sortByLanguage(a, b, languagesById))
                      .map((row) => {
                        const lang = languagesById.get(row.languageId);
                        return (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center gap-2 px-3 py-2"
                          >
                            <span className="text-base leading-none" aria-hidden>
                              {lang ? flagEmoji(lang.countryCode) : "🌐"}
                            </span>
                            <span className="text-sm">
                              {lang
                                ? formatLocaleLabel(lang.countryCode, lang.languageCode)
                                : row.languageId}
                              {lang?.isDefault && (
                                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                                  Default
                                </span>
                              )}
                            </span>
                            <span className="ml-auto flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => openPreviewForRow(row)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setError(null);
                                  setMode({ kind: "edit", template: row });
                                }}
                                className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete(row)}
                                disabled={pending}
                                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                              >
                                Delete
                              </button>
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                )}

                {missing.length > 0 && (
                  <AddTranslationMenu
                    options={missing}
                    onPick={(languageId) => openCreateForKnown(t.key, languageId)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All templates</h2>
        <p className="text-sm text-slate-500">{templates.length} total</p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreateBlank}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          + New template
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {templates.map((t) => {
              const lang = languagesById.get(t.languageId);
              return (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-mono text-xs">{t.key}</td>
                  <td className="px-4 py-3 text-xs">
                    {lang ? (
                      <>
                        <span className="mr-1">{flagEmoji(lang.countryCode)}</span>
                        {lang.countryCode}-{lang.languageCode}
                      </>
                    ) : (
                      <span className="text-slate-400">{t.languageId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                    {t.subject}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setMode({ kind: "edit", template: t });
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(t)}
                        disabled={pending}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No customised templates yet. Use <em>Add translation</em> above to override
                  one for a specific language, or <em>+ New template</em> for an arbitrary key.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode.kind !== "idle" && (
        <TemplateDialog
          mode={mode}
          languages={languages}
          languagesById={languagesById}
          onClose={() => setMode({ kind: "idle" })}
          onSaved={(saved, isCreate) => {
            if (isCreate) {
              refresh([saved, ...templates]);
            } else {
              refresh(templates.map((t) => (t.id === saved.id ? saved : t)));
            }
            setMode({ kind: "idle" });
          }}
          onError={setError}
        />
      )}

      {preview && <PreviewDialog state={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function sortByLanguage(
  a: EmailTemplate,
  b: EmailTemplate,
  byId: Map<string, LanguageRow>,
): number {
  const la = byId.get(a.languageId);
  const lb = byId.get(b.languageId);
  if (la?.isDefault !== lb?.isDefault) return la?.isDefault ? -1 : 1;
  const ka = la ? `${la.countryCode}-${la.languageCode}` : a.languageId;
  const kb = lb ? `${lb.countryCode}-${lb.languageCode}` : b.languageId;
  return ka.localeCompare(kb);
}

function AddTranslationMenu({
  options,
  onPick,
}: {
  options: LanguageRow[];
  onPick: (languageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-3 inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        + Add translation
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <ul className="py-1 text-sm">
            {options.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(l.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span aria-hidden>{flagEmoji(l.countryCode)}</span>
                  <span>{formatLocaleLabel(l.countryCode, l.languageCode)}</span>
                  {l.isDefault && (
                    <span className="ml-auto rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                      Default
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TemplateDialog({
  mode,
  languages,
  languagesById,
  onClose,
  onSaved,
  onError,
}: {
  mode: Exclude<Mode, { kind: "idle" }>;
  languages: LanguageRow[];
  languagesById: Map<string, LanguageRow>;
  onClose: () => void;
  onSaved: (template: EmailTemplate, isCreate: boolean) => void;
  onError: (msg: string) => void;
}) {
  const isCreate = mode.kind === "create";
  const initial = !isCreate ? mode.template : null;
  const prefill = isCreate ? mode.prefill ?? null : null;
  const keyLocked = !!prefill?.keyLocked;
  const languageLocked = !isCreate || !!prefill?.languageLocked;
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const initialLanguageId = initial?.languageId ?? prefill?.languageId ?? "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setLocalError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(fd.get("name") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      bodyText: String(fd.get("bodyText") ?? ""),
      bodyHtml: (fd.get("bodyHtml") as string) || null,
      description: (fd.get("description") as string) || null,
    };
    if (isCreate) {
      payload.key = keyLocked ? prefill!.key : String(fd.get("key") ?? "");
      payload.languageId = languageLocked
        ? prefill!.languageId
        : String(fd.get("languageId") ?? "");
    }

    const url = isCreate
      ? "/api/super-admin/email-templates"
      : `/api/super-admin/email-templates/${initial!.id}`;
    const res = await fetch(url, {
      method: isCreate ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const msg = body?.error ?? `${isCreate ? "Create" : "Update"} failed`;
      setLocalError(msg);
      onError(msg);
      setPending(false);
      return;
    }
    const body = (await res.json()) as { template: EmailTemplate };
    onSaved(body.template, isCreate);
  }

  const initialLang = languagesById.get(initialLanguageId);
  const localeLabel = initialLang
    ? formatLocaleLabel(initialLang.countryCode, initialLang.languageCode)
    : null;

  const heading = isCreate
    ? prefill?.keyLocked
      ? `Customise: ${prefill.key}${localeLabel ? ` — ${localeLabel}` : ""}`
      : "Create template"
    : `Edit template: ${initial!.key}${localeLabel ? ` — ${localeLabel}` : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="my-8 flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <h3 className="text-lg font-semibold">{heading}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Use <code className="font-mono">{"{{variable}}"}</code> placeholders for dynamic
            values (e.g. <code className="font-mono">{"{{name}}"}</code>,{" "}
            <code className="font-mono">{"{{email}}"}</code>).
          </p>
        </div>

        {isCreate && !keyLocked && (
          <Field label="Key (immutable, used by code)" htmlFor="key">
            <input
              id="key"
              name="key"
              required
              pattern="[a-z0-9_]+"
              placeholder="user_invitation"
              className={inputClass + " font-mono"}
            />
          </Field>
        )}
        {isCreate && keyLocked && (
          <Field label="Key" htmlFor="key">
            <input
              id="key"
              name="key"
              defaultValue={prefill!.key}
              readOnly
              className={inputClass + " font-mono cursor-not-allowed opacity-70"}
            />
          </Field>
        )}

        {isCreate && !languageLocked && (
          <Field label="Language" htmlFor="languageId">
            <select
              id="languageId"
              name="languageId"
              required
              defaultValue={initialLanguageId}
              className={inputClass}
            >
              {languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {flagEmoji(l.countryCode)} {formatLocaleLabel(l.countryCode, l.languageCode)}
                  {l.isDefault ? " — Default" : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!isCreate || languageLocked ? (
          <Field label="Language" htmlFor="languageDisplay">
            <input
              id="languageDisplay"
              defaultValue={localeLabel ?? initialLanguageId}
              readOnly
              className={inputClass + " cursor-not-allowed opacity-70"}
            />
          </Field>
        ) : null}

        <Field label="Name" htmlFor="name">
          <input
            id="name"
            name="name"
            defaultValue={initial?.name ?? prefill?.name ?? ""}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Subject" htmlFor="subject">
          <input
            id="subject"
            name="subject"
            defaultValue={initial?.subject ?? prefill?.subject ?? ""}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Plain-text body" htmlFor="bodyText">
          <textarea
            id="bodyText"
            name="bodyText"
            defaultValue={initial?.bodyText ?? prefill?.bodyText ?? ""}
            required
            rows={6}
            className={textareaClass}
          />
        </Field>

        <Field label="HTML body (optional)" htmlFor="bodyHtml">
          <textarea
            id="bodyHtml"
            name="bodyHtml"
            defaultValue={initial?.bodyHtml ?? prefill?.bodyHtml ?? ""}
            rows={6}
            className={textareaClass}
          />
        </Field>

        <Field label="Description (admin-only notes)" htmlFor="description">
          <textarea
            id="description"
            name="description"
            defaultValue={initial?.description ?? prefill?.description ?? ""}
            rows={2}
            className={inputClass}
          />
        </Field>

        {localError && <p className="text-sm text-red-600">{localError}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass + " w-auto"}>
            {pending
              ? "Saving…"
              : isCreate
                ? prefill?.keyLocked
                  ? "Save customised template"
                  : "Create template"
                : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

type PreviewTab = "html" | "text" | "subject";

function PreviewDialog({
  state,
  onClose,
}: {
  state: PreviewState;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PreviewTab>("html");
  const known = KNOWN_TEMPLATES.find((t) => t.key === state.key);
  const sampleVars = known?.sampleVars ?? {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Preview: {state.key}</h3>
            <p className="mt-1 text-xs text-slate-500">
              Rendered with sample variables.{" "}
              <span
                className={
                  "rounded px-1.5 py-0.5 " +
                  (state.source === "defined"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200")
                }
              >
                {state.source === "defined" ? "Customised template" : "Built-in fallback"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
          <p className="mb-1 font-semibold text-slate-500">Sample variables</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            {Object.entries(sampleVars).map(([k, v]) => (
              <li key={k} className="truncate">
                <span className="text-slate-500">{k}</span>: {String(v)}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
          {(["html", "text", "subject"] as PreviewTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "rounded-t-md px-3 py-1.5 text-xs font-medium " +
                (tab === t
                  ? "border-x border-t border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")
              }
            >
              {t === "html" ? "HTML" : t === "text" ? "Plain text" : "Subject"}
            </button>
          ))}
        </div>

        {tab === "subject" && (
          <div className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
            {state.rendered.subject}
          </div>
        )}

        {tab === "html" &&
          (state.rendered.html ? (
            <iframe
              title={`Preview HTML for ${state.key}`}
              sandbox=""
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: #0f172a; background: #ffffff;">${state.rendered.html}</body></html>`}
              className="h-80 w-full rounded-md border border-slate-200 bg-white dark:border-slate-800"
            />
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              No HTML body defined — only the plain-text version is sent.
            </p>
          ))}

        {tab === "text" && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed dark:border-slate-800 dark:bg-slate-950">
            {state.rendered.text}
          </pre>
        )}
      </div>
    </div>
  );
}
