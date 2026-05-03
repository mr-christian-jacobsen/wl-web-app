"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
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
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type TemplatePrefill = {
  key: string;
  keyLocked: boolean;
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
}: {
  initialTemplates: EmailTemplate[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh(next: EmailTemplate[]) {
    setTemplates(next);
    router.refresh();
  }

  function definedFor(key: string): EmailTemplate | undefined {
    return templates.find((t) => t.key === key);
  }

  function openEditForKnown(key: string) {
    setError(null);
    const existing = definedFor(key);
    if (existing) {
      setMode({ kind: "edit", template: existing });
      return;
    }
    const known = KNOWN_TEMPLATES.find((t) => t.key === key);
    if (!known) return;
    setMode({
      kind: "create",
      prefill: {
        key: known.key,
        keyLocked: true,
        name: humanizeKey(known.key),
        subject: known.fallback.subject,
        bodyText: known.fallback.bodyText,
        bodyHtml: known.fallback.bodyHtml,
        description: known.description,
      },
    });
  }

  function openPreviewForKnown(key: string) {
    const known = KNOWN_TEMPLATES.find((t) => t.key === key);
    if (!known) return;
    const vars = known.sampleVars as TemplateVars;
    const existing = definedFor(key);
    if (existing) {
      setPreview({ key, source: "defined", rendered: renderDefinedTemplate(existing, vars) });
      return;
    }
    const rendered = renderFallback(key, vars);
    if (rendered) setPreview({ key, source: "fallback", rendered });
  }

  async function onDelete(t: EmailTemplate) {
    if (!confirm(`Delete template "${t.key}"? This cannot be undone.`)) return;
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
          These keys are referenced from code. Edit to override the built-in copy; preview to see
          how it looks with sample data.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {KNOWN_TEMPLATES.map((t) => {
            const defined = !!definedFor(t.key);
            return (
              <li
                key={t.key}
                className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="font-mono text-xs">{t.key}</code>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-xs " +
                        (defined
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200")
                      }
                    >
                      {defined ? "customised" : "fallback"}
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
                    onClick={() => openPreviewForKnown(t.key)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditForKnown(t.key)}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    Edit
                  </button>
                </div>
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
          onClick={() => {
            setError(null);
            setMode({ kind: "create" });
          }}
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-mono text-xs">{t.key}</td>
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
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No customised templates yet. Click <em>Edit</em> on a row above to override
                  one, or <em>+ New template</em> for an arbitrary key.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode.kind !== "idle" && (
        <TemplateDialog
          mode={mode}
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

function TemplateDialog({
  mode,
  onClose,
  onSaved,
  onError,
}: {
  mode: Exclude<Mode, { kind: "idle" }>;
  onClose: () => void;
  onSaved: (template: EmailTemplate, isCreate: boolean) => void;
  onError: (msg: string) => void;
}) {
  const isCreate = mode.kind === "create";
  const initial = !isCreate ? mode.template : null;
  const prefill = isCreate ? mode.prefill ?? null : null;
  const keyLocked = !!prefill?.keyLocked;
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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

  const heading = isCreate
    ? prefill
      ? `Customise: ${prefill.key}`
      : "Create template"
    : `Edit template: ${initial!.key}`;

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
                ? prefill
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
