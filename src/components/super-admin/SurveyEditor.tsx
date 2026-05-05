"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { StepTypePicker } from "@/components/super-admin/StepTypePicker";
import { DEFAULT_STEP_TYPE_KEY, getStepType } from "@/lib/step-types";

type Step = {
  id: string;
  position: number;
  type: string;
  title: string;
  notes: string | null;
};

type Survey = {
  id: string;
  name: string;
  description: string | null;
  steps: Step[];
};

type Status = { kind: "idle" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string };

export function SurveyEditor({ survey }: { survey: Survey }) {
  const router = useRouter();
  const [name, setName] = useState(survey.name);
  const [description, setDescription] = useState(survey.description ?? "");
  const [steps, setSteps] = useState<Step[]>(survey.steps);
  const [detailsStatus, setDetailsStatus] = useState<Status>({ kind: "idle" });
  const [detailsPending, setDetailsPending] = useState(false);

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDetailsPending(true);
    setDetailsStatus({ kind: "idle" });
    const res = await fetch(`/api/super-admin/surveys/${survey.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description || null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setDetailsStatus({ kind: "err", msg: body?.error ?? "Could not save" });
      setDetailsPending(false);
      return;
    }
    setDetailsStatus({ kind: "ok", msg: "Saved" });
    setDetailsPending(false);
    router.refresh();
  }

  async function deleteSurvey() {
    if (!confirm(`Delete "${survey.name}" and all its steps?`)) return;
    const res = await fetch(`/api/super-admin/surveys/${survey.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not delete survey");
      return;
    }
    router.push("/super-admin/surveys");
    router.refresh();
  }

  function applyAddedStep(step: Step) {
    setSteps((cur) => [...cur, step]);
  }

  function applyUpdatedStep(step: Step) {
    setSteps((cur) => cur.map((s) => (s.id === step.id ? { ...s, ...step } : s)));
  }

  function applyDeletedStep(stepId: string) {
    setSteps((cur) =>
      cur
        .filter((s) => s.id !== stepId)
        .map((s, i) => ({ ...s, position: i })),
    );
  }

  async function moveStep(stepId: string, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;

    const a = steps[idx];
    const b = steps[target];
    if (!a || !b) return;
    const next = steps.slice();
    next[idx] = b;
    next[target] = a;
    const reordered = next.map((s, i) => ({ ...s, position: i }));
    setSteps(reordered);

    const res = await fetch(`/api/super-admin/surveys/${survey.id}/steps/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: reordered.map((s) => s.id) }),
    });
    if (!res.ok) {
      // Revert on failure.
      setSteps(steps);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not reorder steps");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={saveDetails}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 className="text-lg font-semibold">Survey details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="survey-name">
            <input
              id="survey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <Field label="Description" htmlFor="survey-description">
            <textarea
              id="survey-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={detailsPending} className={buttonClass + " sm:w-auto"}>
            {detailsPending ? "Saving…" : "Save survey"}
          </button>
          <button
            type="button"
            onClick={deleteSurvey}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            Delete survey
          </button>
          {detailsStatus.kind !== "idle" && (
            <span
              className={
                detailsStatus.kind === "ok"
                  ? "text-sm text-emerald-700"
                  : "text-sm text-red-600"
              }
            >
              {detailsStatus.msg}
            </span>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Steps</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Reorder with the up/down arrows. Click an icon to change a step&apos;s type.
        </p>

        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              surveyId={survey.id}
              step={step}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
              onUpdated={applyUpdatedStep}
              onDeleted={applyDeletedStep}
              onMove={(dir) => moveStep(step.id, dir)}
            />
          ))}
        </ol>

        {steps.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            No steps yet — pick a type below to add the first one.
          </div>
        )}

        <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <AddStepForm surveyId={survey.id} onAdded={applyAddedStep} />
        </div>
      </div>
    </div>
  );
}

function StepRow({
  surveyId,
  step,
  isFirst,
  isLast,
  onUpdated,
  onDeleted,
  onMove,
}: {
  surveyId: string;
  step: Step;
  isFirst: boolean;
  isLast: boolean;
  onUpdated: (step: Step) => void;
  onDeleted: (stepId: string) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const type = getStepType(step.type);

  async function onDelete() {
    if (!confirm(`Delete step "${step.title}"?`)) return;
    const res = await fetch(`/api/super-admin/surveys/${surveyId}/steps/${step.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not delete step");
      return;
    }
    onDeleted(step.id);
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-start">
      <div className="flex flex-row items-center gap-2 sm:flex-col">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          aria-label="Move up"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          ↑
        </button>
        <span className="text-xs font-mono text-slate-500">{step.position + 1}</span>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={isLast}
          aria-label="Move down"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          ↓
        </button>
      </div>

      <div className="h-12 w-12 shrink-0 rounded-md border border-slate-300 bg-white p-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={type.icon} alt={type.label} className="h-full w-full object-contain" />
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <StepEditForm
            surveyId={surveyId}
            step={step}
            onCancel={() => setEditing(false)}
            onUpdated={(s) => {
              onUpdated(s);
              setEditing(false);
            }}
          />
        ) : (
          <>
            <p className="truncate text-base font-medium">{step.title}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">{type.label}</p>
            {step.notes && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">
                {step.notes}
              </p>
            )}
          </>
        )}
      </div>

      {!editing && (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function StepEditForm({
  surveyId,
  step,
  onCancel,
  onUpdated,
}: {
  surveyId: string;
  step: Step;
  onCancel: () => void;
  onUpdated: (step: Step) => void;
}) {
  const [type, setType] = useState(step.type);
  const [title, setTitle] = useState(step.title);
  const [notes, setNotes] = useState(step.notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/super-admin/surveys/${surveyId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, title, notes: notes || null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not save step");
      setPending(false);
      return;
    }
    const body = (await res.json()) as { step: Step };
    onUpdated(body.step);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Type</p>
        <StepTypePicker value={type} onChange={(t) => setType(t.key)} size="sm" />
      </div>
      <Field label="Title" htmlFor={`step-title-${step.id}`}>
        <input
          id={`step-title-${step.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={160}
          className={inputClass}
        />
      </Field>
      <Field label="Notes" htmlFor={`step-notes-${step.id}`}>
        <textarea
          id={`step-notes-${step.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={4000}
          className={inputClass}
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
          {pending ? "Saving…" : "Save step"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddStepForm({
  surveyId,
  onAdded,
}: {
  surveyId: string;
  onAdded: (step: Step) => void;
}) {
  const [type, setType] = useState<string>(DEFAULT_STEP_TYPE_KEY);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/super-admin/surveys/${surveyId}/steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, title, notes: notes || null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not add step");
      setPending(false);
      return;
    }
    const body = (await res.json()) as { step: Step };
    onAdded(body.step);
    setTitle("");
    setNotes("");
    setType(DEFAULT_STEP_TYPE_KEY);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Add a step</h3>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Pick a type
        </p>
        <StepTypePicker value={type} onChange={(t) => setType(t.key)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="new-step-title">
          <input
            id="new-step-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            className={inputClass}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="new-step-notes">
          <textarea
            id="new-step-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={4000}
            className={inputClass}
          />
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
          {pending ? "Adding…" : "Add step"}
        </button>
      </div>
    </form>
  );
}
