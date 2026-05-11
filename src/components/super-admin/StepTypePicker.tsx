"use client";

import { StepTypeIcon } from "@/components/super-admin/StepTypeIcon";
import { STEP_TYPES, type StepType } from "@/lib/step-types";

/**
 * Grid of small images (one per step type) the user clicks to pick the
 * type of a step. Designed for both the "add step" form and the
 * "change type" affordance on an existing step.
 */
export function StepTypePicker({
  value,
  onChange,
  size = "md",
}: {
  value: string | null;
  onChange: (type: StepType) => void;
  size?: "sm" | "md";
}) {
  const tile =
    size === "sm" ? "h-12 w-12 p-2" : "h-16 w-16 p-2.5";
  return (
    <div
      role="radiogroup"
      aria-label="Step type"
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7"
    >
      {STEP_TYPES.map((t) => {
        const selected = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${t.label} — ${t.description}`}
            onClick={() => onChange(t)}
            className={
              "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition " +
              (selected
                ? "border-slate-900 bg-slate-900 text-white shadow dark:border-white dark:bg-white dark:text-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800")
            }
          >
            <StepTypeIcon src={t.icon} className={tile} />
            <span className="font-medium">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
