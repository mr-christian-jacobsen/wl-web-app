"use client";

import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { parseOptions } from "@/lib/step-types";

type Step = {
  id: string;
  position: number;
  type: string;
  title: string;
  notes: string | null;
  options: string | null;
};

type Survey = {
  id: string;
  name: string;
  description: string | null;
  steps: Step[];
};

type Mode = "live" | "preview";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok" }
  | { kind: "err"; msg: string };

/**
 * Renders a public survey form. Used both by `/s/[id]` (live, posts to
 * the public submission endpoint) and by the admin-only preview page,
 * where `mode === "preview"` short-circuits the submit so admins can
 * dry-run without writing rows.
 */
export function SurveyForm({ survey, mode = "live" }: { survey: Survey; mode?: Mode }) {
  const [values, setValues] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(
      survey.steps.map((s) => [s.id, s.type === "multi_choice" ? [] : ""]),
    ),
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function update(stepId: string, value: string | string[]) {
    setValues((cur) => ({ ...cur, [stepId]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "submitting" });

    if (mode === "preview") {
      // No-op submission: show the success state without writing.
      setStatus({ kind: "ok" });
      return;
    }

    const answers = survey.steps.map((s) => ({ stepId: s.id, value: values[s.id] ?? "" }));
    const res = await fetch(`/api/surveys/${survey.id}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Could not submit" });
      return;
    }
    setStatus({ kind: "ok" });
  }

  if (status.kind === "ok") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950">
        <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
          {mode === "preview" ? "Preview submission accepted" : "Thanks — your response was recorded."}
        </p>
        {mode === "preview" && (
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
            Nothing was actually saved. Reload to fill the form again.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {survey.steps.map((step) => (
        <StepField
          key={step.id}
          step={step}
          value={values[step.id] ?? (step.type === "multi_choice" ? [] : "")}
          onChange={(v) => update(step.id, v)}
        />
      ))}
      {status.kind === "err" && <p className="text-sm text-red-600">{status.msg}</p>}
      <div>
        <button
          type="submit"
          disabled={status.kind === "submitting"}
          className={buttonClass + " sm:w-auto"}
        >
          {status.kind === "submitting" ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}

function StepField({
  step,
  value,
  onChange,
}: {
  step: Step;
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const id = `step-${step.id}`;
  const label = (
    <span>
      {step.title}
      <span className="ml-1 text-red-600" aria-hidden="true">*</span>
    </span>
  );

  if (step.type === "long_text") {
    return (
      <Field label={label} htmlFor={id}>
        {step.notes && <Notes text={step.notes} />}
        <textarea
          id={id}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          required
          maxLength={10_000}
          className={inputClass}
        />
      </Field>
    );
  }

  if (step.type === "single_choice") {
    const options = parseOptions(step.options);
    return (
      <Field label={label} htmlFor={id}>
        {step.notes && <Notes text={step.notes} />}
        <div role="radiogroup" className="flex flex-col gap-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={id}
                value={opt}
                checked={value === opt}
                onChange={(e) => onChange(e.target.value)}
                required
              />
              {opt}
            </label>
          ))}
        </div>
      </Field>
    );
  }

  if (step.type === "multi_choice") {
    const options = parseOptions(step.options);
    const checked = new Set(Array.isArray(value) ? value : []);
    return (
      <Field label={label} htmlFor={id}>
        {step.notes && <Notes text={step.notes} />}
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                value={opt}
                checked={checked.has(opt)}
                onChange={(e) => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(opt);
                  else next.delete(opt);
                  onChange(Array.from(next));
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      </Field>
    );
  }

  if (step.type === "rating") {
    return (
      <Field label={label} htmlFor={id}>
        {step.notes && <Notes text={step.notes} />}
        <div role="radiogroup" aria-label={step.title} className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = value === String(n);
            return (
              <button
                key={n}
                type="button"
                aria-checked={selected}
                role="radio"
                onClick={() => onChange(String(n))}
                className={
                  "flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium " +
                  (selected
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800")
                }
              >
                {n}
              </button>
            );
          })}
        </div>
        {/* Hidden input keeps the form "required" semantics consistent. */}
        <input type="hidden" name={id} value={(value as string) ?? ""} required />
      </Field>
    );
  }

  if (step.type === "yes_no") {
    return (
      <Field label={label} htmlFor={id}>
        {step.notes && <Notes text={step.notes} />}
        <div role="radiogroup" className="flex gap-4">
          {[
            { v: "yes", label: "Yes" },
            { v: "no", label: "No" },
          ].map(({ v, label }) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={id}
                value={v}
                checked={value === v}
                onChange={(e) => onChange(e.target.value)}
                required
              />
              {label}
            </label>
          ))}
        </div>
      </Field>
    );
  }

  if (step.type === "date") {
    return (
      <Field label={label} htmlFor={id}>
        {step.notes && <Notes text={step.notes} />}
        <input
          id={id}
          type="date"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          required
          className={inputClass + " sm:max-w-xs"}
        />
      </Field>
    );
  }

  // short_text and unknown fallback.
  return (
    <Field label={label} htmlFor={id}>
      {step.notes && <Notes text={step.notes} />}
      <input
        id={id}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={500}
        className={inputClass}
      />
    </Field>
  );
}

function Notes({ text }: { text: string }) {
  return (
    <p className="-mt-1 mb-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
      {text}
    </p>
  );
}
