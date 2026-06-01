"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { BackfillDialog } from "@/components/tasks/BackfillDialog";
import { useTranslation } from "@/components/TranslationsProvider";
import { PREDICATE_CATALOG } from "@/lib/predicates.catalog";

/**
 * Admin task definition editor (U7). One form, one save — the whole
 * task (title, description, predicate, trigger list, enabled) is
 * PATCHed in a single round-trip so partial-save races are impossible.
 *
 * UI shape decisions:
 *   - Predicate dropdown renders the "manual / trust user" sentinel as
 *     the first option, separated from the catalog entries by a
 *     `<hr>`-style group. This is the simplest cue that "manual" is
 *     not a predicate name; the plan flagged richer visual treatment
 *     as a deferred-UX call.
 *   - Trigger combinator is a row-based list with kind-specific
 *     sub-fields (per the plan; tabs / checkbox-reveal were the other
 *     options and were rejected as less flexible). "Add trigger"
 *     appends a row defaulting to `signup`; per-row "Remove" deletes.
 *     `signup` / `manual_assign` rows show no sub-fields; `recurring`
 *     shows an integer input; `specific_date` shows a textarea
 *     (one YYYY-MM-DD per line). The textarea is the simplest input
 *     for a multi-date list — a real date picker is deferred.
 *   - Enable toggle: flipping disabled → enabled routes through
 *     `BackfillDialog` (U5) whenever the task already exists in the
 *     DB AND has no instances yet. The dialog uses the U5 count
 *     endpoint and the U5 enable endpoint internally. We skip the
 *     dialog (and just inline-PATCH `enabled: true`) only for the
 *     degenerate case of a brand-new task with no users to backfill
 *     into — but in practice the dialog handles N=0 cleanly, so we
 *     always open it on the false → true transition for any saved
 *     task.
 *   - Disabling (enabled → disabled) flips inline — no backfill side
 *     effects.
 */

type Trigger = {
  // Persisted triggers have a DB id; locally-added rows leave it
  // undefined until first save (the PATCH handler deletes the old
  // trigger set and recreates it, so the ids round-trip as fresh on
  // every save).
  id?: string;
  kind: "signup" | "manual_assign" | "recurring" | "specific_date";
  intervalDays: number | null;
  dateList: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  predicateKey: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  triggers: Trigger[];
  instanceCount: number;
};

type Status = { kind: "idle" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string };

const MANUAL_SENTINEL = "__manual__";

function emptyTriggerOfKind(kind: Trigger["kind"]): Trigger {
  if (kind === "recurring") return { kind, intervalDays: 7, dateList: null };
  if (kind === "specific_date") return { kind, intervalDays: null, dateList: "" };
  return { kind, intervalDays: null, dateList: null };
}

export function AdminTaskEditor({ task }: { task: Task }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [predicateKey, setPredicateKey] = useState<string>(
    task.predicateKey ?? MANUAL_SENTINEL,
  );
  const [triggers, setTriggers] = useState<Trigger[]>(task.triggers);
  const [enabled, setEnabled] = useState(task.enabled);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);

  function updateTrigger(idx: number, next: Partial<Trigger>) {
    setTriggers((cur) =>
      cur.map((tr, i) => (i === idx ? { ...tr, ...next } : tr)),
    );
  }

  function changeTriggerKind(idx: number, kind: Trigger["kind"]) {
    setTriggers((cur) =>
      cur.map((tr, i) => (i === idx ? { ...emptyTriggerOfKind(kind), id: tr.id } : tr)),
    );
  }

  function addTrigger() {
    setTriggers((cur) => [...cur, emptyTriggerOfKind("signup")]);
  }

  function removeTrigger(idx: number) {
    setTriggers((cur) => cur.filter((_, i) => i !== idx));
  }

  /** Build the PATCH body, including validation of the date textarea
   *  into an array. Returns null when the form is invalid (state is
   *  set to an error in that case). */
  function buildPayload(): {
    title: string;
    description: string | null;
    predicateKey: string | null;
    triggers: Array<
      | { kind: "signup" }
      | { kind: "manual_assign" }
      | { kind: "recurring"; intervalDays: number }
      | { kind: "specific_date"; dates: string[] }
    >;
    enabled: boolean;
  } | null {
    if (triggers.length === 0) {
      setStatus({
        kind: "err",
        msg: t("super_admin.tasks.editor.error.no_triggers"),
      });
      return null;
    }

    const wireTriggers: Array<
      | { kind: "signup" }
      | { kind: "manual_assign" }
      | { kind: "recurring"; intervalDays: number }
      | { kind: "specific_date"; dates: string[] }
    > = [];
    for (let i = 0; i < triggers.length; i++) {
      const tr = triggers[i]!;
      if (tr.kind === "signup" || tr.kind === "manual_assign") {
        wireTriggers.push({ kind: tr.kind });
        continue;
      }
      if (tr.kind === "recurring") {
        if (!tr.intervalDays || tr.intervalDays < 1) {
          setStatus({
            kind: "err",
            msg: t("super_admin.tasks.editor.error.bad_interval", { idx: i + 1 }),
          });
          return null;
        }
        wireTriggers.push({ kind: "recurring", intervalDays: tr.intervalDays });
        continue;
      }
      // specific_date
      const dates = (tr.dateList ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (dates.length === 0) {
        setStatus({
          kind: "err",
          msg: t("super_admin.tasks.editor.error.no_dates", { idx: i + 1 }),
        });
        return null;
      }
      for (const d of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          setStatus({
            kind: "err",
            msg: t("super_admin.tasks.editor.error.bad_date", { date: d }),
          });
          return null;
        }
      }
      wireTriggers.push({ kind: "specific_date", dates });
    }

    return {
      title,
      description: description.trim() ? description : null,
      predicateKey: predicateKey === MANUAL_SENTINEL ? null : predicateKey,
      triggers: wireTriggers,
      enabled,
    };
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "idle" });

    const payload = buildPayload();
    if (!payload) return;

    setPending(true);
    const res = await fetch(`/api/super-admin/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({
        kind: "err",
        msg: body?.error ?? t("super_admin.tasks.editor.save_failed"),
      });
      setPending(false);
      return;
    }
    setStatus({ kind: "ok", msg: t("super_admin.tasks.editor.saved") });
    setPending(false);
    router.refresh();
  }

  function onToggleEnabled(next: boolean) {
    if (next === enabled) return;
    if (next) {
      // Disabled → enabled: route through the BackfillDialog so the
      // admin gets the silent-vs-notify choice (U5). The dialog hits
      // the dedicated `/enable` endpoint internally, which is the only
      // path that flips `enabled: true` for a previously-disabled task.
      setBackfillOpen(true);
      return;
    }
    // Enabled → disabled: inline PATCH, no backfill side effects.
    void disableInline();
  }

  async function disableInline() {
    setPending(true);
    const res = await fetch(`/api/super-admin/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? t("super_admin.tasks.editor.save_failed"));
      return;
    }
    setEnabled(false);
    router.refresh();
  }

  async function deleteTask() {
    if (!confirm(t("super_admin.tasks.editor.delete_confirm", { title: task.title }))) return;
    const res = await fetch(`/api/super-admin/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? t("super_admin.tasks.editor.delete_failed"));
      return;
    }
    router.push("/super-admin/tasks");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {backfillOpen && (
        <BackfillDialog
          taskId={task.id}
          onConfirmed={() => {
            setEnabled(true);
            setBackfillOpen(false);
            router.refresh();
          }}
          onClose={() => setBackfillOpen(false)}
        />
      )}

      <form
        onSubmit={save}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">
            {t("super_admin.tasks.editor.details_section")}
          </h2>
          <EnabledControl
            enabled={enabled}
            pending={pending}
            onChange={onToggleEnabled}
          />
        </div>

        <div className="mt-4 grid gap-4">
          <Field
            label={t("super_admin.tasks.editor.title_label")}
            htmlFor="task-edit-title"
          >
            <input
              id="task-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={160}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("super_admin.tasks.editor.description_label")}
            htmlFor="task-edit-description"
          >
            <textarea
              id="task-edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("super_admin.tasks.editor.predicate_label")}
            htmlFor="task-edit-predicate"
          >
            <select
              id="task-edit-predicate"
              value={predicateKey}
              onChange={(e) => setPredicateKey(e.target.value)}
              className={inputClass}
            >
              {/* "Manual / trust user" sentinel as the first option,
                  visually separated by a non-selectable divider so it
                  reads as a different category from the catalog
                  predicates underneath it. */}
              <option value={MANUAL_SENTINEL}>
                {t("super_admin.tasks.editor.predicate_manual")}
              </option>
              <option disabled>──────────</option>
              {PREDICATE_CATALOG.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {predicateKey === MANUAL_SENTINEL
                ? t("super_admin.tasks.editor.predicate_manual_hint")
                : (PREDICATE_CATALOG.find((p) => p.key === predicateKey)?.description ?? "")}
            </p>
          </Field>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {t("super_admin.tasks.editor.triggers_section")}
            </h3>
            <button
              type="button"
              onClick={addTrigger}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("super_admin.tasks.editor.add_trigger")}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t("super_admin.tasks.editor.triggers_description")}
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {triggers.map((trigger, idx) => (
              <li
                key={trigger.id ?? `new-${idx}`}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-start"
              >
                <div className="flex flex-1 flex-col gap-3">
                  <select
                    value={trigger.kind}
                    onChange={(e) =>
                      changeTriggerKind(idx, e.target.value as Trigger["kind"])
                    }
                    className={inputClass}
                  >
                    <option value="signup">
                      {t("super_admin.tasks.editor.trigger.signup")}
                    </option>
                    <option value="manual_assign">
                      {t("super_admin.tasks.editor.trigger.manual_assign")}
                    </option>
                    <option value="recurring">
                      {t("super_admin.tasks.editor.trigger.recurring")}
                    </option>
                    <option value="specific_date">
                      {t("super_admin.tasks.editor.trigger.specific_date")}
                    </option>
                  </select>

                  {trigger.kind === "recurring" && (
                    <Field
                      label={t("super_admin.tasks.editor.trigger.interval_label")}
                      htmlFor={`trigger-${idx}-interval`}
                    >
                      <input
                        id={`trigger-${idx}-interval`}
                        type="number"
                        min={1}
                        value={trigger.intervalDays ?? ""}
                        onChange={(e) =>
                          updateTrigger(idx, {
                            intervalDays: e.target.value
                              ? parseInt(e.target.value, 10)
                              : null,
                          })
                        }
                        className={inputClass}
                      />
                    </Field>
                  )}

                  {trigger.kind === "specific_date" && (
                    <Field
                      label={t("super_admin.tasks.editor.trigger.dates_label")}
                      htmlFor={`trigger-${idx}-dates`}
                    >
                      <textarea
                        id={`trigger-${idx}-dates`}
                        rows={3}
                        value={trigger.dateList ?? ""}
                        onChange={(e) =>
                          updateTrigger(idx, { dateList: e.target.value })
                        }
                        placeholder="2026-06-15&#10;2026-07-15"
                        className={inputClass + " font-mono text-sm"}
                      />
                    </Field>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeTrigger(idx)}
                  className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {t("admin.action.delete")}
                </button>
              </li>
            ))}
          </ul>

          {triggers.length === 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
              {t("super_admin.tasks.editor.triggers_empty")}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
            {pending
              ? t("admin.action.saving")
              : t("super_admin.tasks.editor.save_button")}
          </button>
          <button
            type="button"
            onClick={deleteTask}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {t("super_admin.tasks.editor.delete_button")}
          </button>
          {status.kind !== "idle" && (
            <span
              className={
                status.kind === "ok"
                  ? "text-sm text-emerald-700"
                  : "text-sm text-red-600"
              }
            >
              {status.msg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function EnabledControl({
  enabled,
  pending,
  onChange,
}: {
  enabled: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "rounded-full px-2 py-0.5 text-xs font-medium " +
          (enabled
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
            : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200")
        }
      >
        {enabled
          ? t("super_admin.tasks.status.enabled")
          : t("super_admin.tasks.status.disabled")}
      </span>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        disabled={pending}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {enabled
          ? t("super_admin.tasks.editor.disable_button")
          : t("super_admin.tasks.editor.enable_button")}
      </button>
    </div>
  );
}
