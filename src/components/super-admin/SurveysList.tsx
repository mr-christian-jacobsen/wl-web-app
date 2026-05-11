"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

type SurveySummary = {
  id: string;
  name: string;
  description: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
};

export function SurveysList({ initial }: { initial: SurveySummary[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [surveys, setSurveys] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/super-admin/surveys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: data.name, description: data.description || null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? t("super_admin.surveys.create_failed"));
      setPending(false);
      return;
    }
    const body = (await res.json()) as { survey: SurveySummary };
    setSurveys((cur) => [body.survey, ...cur]);
    setCreating(false);
    setPending(false);
    router.push(`/super-admin/surveys/${body.survey.id}`);
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(t("super_admin.survey_editor.delete_confirm", { name }))) return;
    setDeletingId(id);
    const res = await fetch(`/api/super-admin/surveys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? t("super_admin.survey_editor.delete_failed"));
      setDeletingId(null);
      return;
    }
    setSurveys((cur) => cur.filter((s) => s.id !== id));
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {surveys.length === 0
            ? t("super_admin.surveys.empty")
            : t("super_admin.users.total", { n: surveys.length })}
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setError(null);
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {t("super_admin.surveys.new")}
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <Field label={t("super_admin.surveys.dialog.name")} htmlFor="survey-name">
            <input
              id="survey-name"
              name="name"
              required
              maxLength={120}
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field
            label={t("super_admin.surveys.dialog.description")}
            htmlFor="survey-description"
          >
            <textarea
              id="survey-description"
              name="description"
              rows={3}
              maxLength={2000}
              className={inputClass}
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
              {pending
                ? t("admin.action.saving")
                : t("super_admin.surveys.dialog.create")}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("admin.action.cancel")}
            </button>
          </div>
        </form>
      )}

      {surveys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("super_admin.surveys.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {surveys.map((survey) => (
            <li
              key={survey.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <Link
                href={`/super-admin/surveys/${survey.id}`}
                className="flex min-w-0 flex-1 flex-col gap-1 hover:opacity-80"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-medium">{survey.name}</span>
                  <PublishedBadge published={survey.published} />
                </span>
                {survey.description && (
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">
                    {survey.description}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {survey.stepCount} {t("super_admin.surveys.col.steps").toLowerCase()} · updated{" "}
                  {new Date(survey.updatedAt).toLocaleDateString()}
                </span>
              </Link>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/super-admin/surveys/${survey.id}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {t("admin.action.edit")}
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(survey.id, survey.name)}
                  disabled={deletingId === survey.id}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {deletingId === survey.id
                    ? t("admin.action.deleting")
                    : t("admin.action.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PublishedBadge({ published }: { published: boolean }) {
  const { t } = useTranslation();
  return published ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
      {t("super_admin.surveys.status.live")}
    </span>
  ) : (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
      {t("super_admin.surveys.status.draft")}
    </span>
  );
}
