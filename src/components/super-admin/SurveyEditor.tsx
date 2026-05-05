"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { StepTypePicker } from "@/components/super-admin/StepTypePicker";
import {
  DEFAULT_STEP_TYPE_KEY,
  getStepType,
  parseOptions,
  stepTypeRequiresOptions,
} from "@/lib/step-types";

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
  published: boolean;
  publishedAt: string | null;
  steps: Step[];
};

type Status = { kind: "idle" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string };

export function SurveyEditor({ survey }: { survey: Survey }) {
  const router = useRouter();
  const [name, setName] = useState(survey.name);
  const [description, setDescription] = useState(survey.description ?? "");
  const [steps, setSteps] = useState<Step[]>(survey.steps);
  const [published, setPublished] = useState(survey.published);
  const [detailsStatus, setDetailsStatus] = useState<Status>({ kind: "idle" });
  const [detailsPending, setDetailsPending] = useState(false);
  const [publishPending, setPublishPending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  async function togglePublish() {
    const next = !published;
    setPublishPending(true);
    const res = await fetch(`/api/super-admin/surveys/${survey.id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: next }),
    });
    setPublishPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not update publish state");
      return;
    }
    setPublished(next);
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
      cur.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, position: i })),
    );
  }

  async function persistOrder(reordered: Step[]) {
    const res = await fetch(`/api/super-admin/surveys/${survey.id}/steps/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: reordered.map((s) => s.id) }),
    });
    if (!res.ok) {
      setSteps(steps);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not reorder steps");
    }
  }

  async function moveStep(stepId: string, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const reordered = arrayMove(steps, idx, target).map((s, i) => ({ ...s, position: i }));
    setSteps(reordered);
    await persistOrder(reordered);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(steps, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
    setSteps(reordered);
    await persistOrder(reordered);
  }

  const publicUrl = `/s/${survey.id}`;
  const previewUrl = `/super-admin/surveys/${survey.id}/preview`;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={saveDetails}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Survey details</h2>
          <PublishStatus
            published={published}
            publishedAt={survey.publishedAt}
            onToggle={togglePublish}
            pending={publishPending}
          />
        </div>
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
          <Link
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Preview survey ↗
          </Link>
          {published && (
            <Link
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950"
            >
              Public link ↗
            </Link>
          )}
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
          Drag the handle to reorder, or use the up/down arrows. Click a tile to change a step&apos;s
          type.
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="mt-4 flex flex-col gap-3">
              {steps.map((step, i) => (
                <SortableStepRow
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
          </SortableContext>
        </DndContext>

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

function PublishStatus({
  published,
  publishedAt,
  onToggle,
  pending,
}: {
  published: boolean;
  publishedAt: string | null;
  onToggle: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "rounded-full px-2 py-0.5 text-xs font-medium " +
          (published
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
            : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200")
        }
      >
        {published ? "Live" : "Draft"}
      </span>
      {published && publishedAt && (
        <span className="text-xs text-slate-500">
          since {new Date(publishedAt).toLocaleDateString()}
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {pending ? "…" : published ? "Unpublish" : "Publish"}
      </button>
    </div>
  );
}

function SortableStepRow(props: React.ComponentProps<typeof StepRow>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.step.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <StepRow {...props} dragAttributes={attributes} dragListeners={listeners} />
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
  dragAttributes,
  dragListeners,
}: {
  surveyId: string;
  step: Step;
  isFirst: boolean;
  isLast: boolean;
  onUpdated: (step: Step) => void;
  onDeleted: (stepId: string) => void;
  onMove: (dir: -1 | 1) => void;
  dragAttributes?: React.HTMLAttributes<HTMLButtonElement>;
  dragListeners?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [editing, setEditing] = useState(false);
  const type = getStepType(step.type);
  const optionList = parseOptions(step.options);

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
          aria-label="Drag to reorder"
          className="cursor-grab rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 active:cursor-grabbing dark:border-slate-700 dark:hover:bg-slate-800"
          {...dragAttributes}
          {...dragListeners}
        >
          ⋮⋮
        </button>
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
            {optionList.length > 0 && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Options: {optionList.join(", ")}
              </p>
            )}
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
  const [options, setOptions] = useState(step.options ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showOptions = stepTypeRequiresOptions(type);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/super-admin/surveys/${surveyId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        title,
        notes: notes || null,
        options: showOptions ? options : null,
      }),
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
      {showOptions && (
        <Field label="Options (one per line)" htmlFor={`step-options-${step.id}`}>
          <textarea
            id={`step-options-${step.id}`}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            rows={3}
            placeholder={"Option 1\nOption 2"}
            className={inputClass}
          />
        </Field>
      )}
      <Field label="Notes (optional helper text)" htmlFor={`step-notes-${step.id}`}>
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
  const [options, setOptions] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showOptions = stepTypeRequiresOptions(type);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/super-admin/surveys/${surveyId}/steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        title,
        notes: notes || null,
        options: showOptions ? options : null,
      }),
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
    setOptions("");
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
        <Field label="Notes (optional helper text)" htmlFor="new-step-notes">
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
      {showOptions && (
        <Field label="Options (one per line)" htmlFor="new-step-options">
          <textarea
            id="new-step-options"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            rows={3}
            placeholder={"Option 1\nOption 2"}
            className={inputClass}
          />
        </Field>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
          {pending ? "Adding…" : "Add step"}
        </button>
      </div>
    </form>
  );
}
