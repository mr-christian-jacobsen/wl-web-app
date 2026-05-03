"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

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

type Mode =
  | { kind: "idle" }
  | { kind: "create" }
  | { kind: "edit"; template: EmailTemplate };

const textareaClass = inputClass + " font-mono text-xs leading-relaxed";

export function EmailTemplatesTable({
  initialTemplates,
}: {
  initialTemplates: EmailTemplate[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh(next: EmailTemplate[]) {
    setTemplates(next);
    router.refresh();
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
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

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
                  No templates yet. Click <em>+ New template</em> to create one.
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
  const initial = isCreate ? null : mode.template;
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
    if (isCreate) payload.key = String(fd.get("key") ?? "");

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
          <h3 className="text-lg font-semibold">
            {isCreate ? "Create template" : `Edit template: ${initial!.key}`}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Use <code className="font-mono">{"{{variable}}"}</code> placeholders for dynamic
            values (e.g. <code className="font-mono">{"{{name}}"}</code>,{" "}
            <code className="font-mono">{"{{email}}"}</code>).
          </p>
        </div>

        {isCreate && (
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

        <Field label="Name" htmlFor="name">
          <input
            id="name"
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Subject" htmlFor="subject">
          <input
            id="subject"
            name="subject"
            defaultValue={initial?.subject ?? ""}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Plain-text body" htmlFor="bodyText">
          <textarea
            id="bodyText"
            name="bodyText"
            defaultValue={initial?.bodyText ?? ""}
            required
            rows={6}
            className={textareaClass}
          />
        </Field>

        <Field label="HTML body (optional)" htmlFor="bodyHtml">
          <textarea
            id="bodyHtml"
            name="bodyHtml"
            defaultValue={initial?.bodyHtml ?? ""}
            rows={6}
            className={textareaClass}
          />
        </Field>

        <Field label="Description (admin-only notes)" htmlFor="description">
          <textarea
            id="description"
            name="description"
            defaultValue={initial?.description ?? ""}
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
            {pending ? "Saving…" : isCreate ? "Create template" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
