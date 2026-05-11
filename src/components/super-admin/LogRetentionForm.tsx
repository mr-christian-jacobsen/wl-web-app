"use client";

import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

export type LogRetentionView = {
  error: number;
  warning: number;
  info: number;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type PruneState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "result"; total: number; error: number; warning: number; info: number }
  | { kind: "error"; message: string };

export function LogRetentionForm({ initial }: { initial: LogRetentionView }) {
  const { t } = useTranslation();
  const [retention, setRetention] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [prune, setPrune] = useState<PruneState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSave({ kind: "saving" });
    const fd = new FormData(e.currentTarget);
    const payload = {
      errorDays: Number(fd.get("errorDays") ?? 0),
      warningDays: Number(fd.get("warningDays") ?? 0),
      infoDays: Number(fd.get("infoDays") ?? 0),
    };

    const res = await fetch("/api/super-admin/system-settings/log-retention", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setSave({ kind: "error", message: body?.error ?? t("super_admin.log_retention.save_failed") });
      return;
    }
    const body = (await res.json()) as { retention: LogRetentionView };
    setRetention(body.retention);
    setSave({ kind: "saved" });
  }

  async function onPrune() {
    setPrune({ kind: "running" });
    const res = await fetch("/api/super-admin/system-settings/log-retention/prune", {
      method: "POST",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setPrune({ kind: "error", message: body?.error ?? t("super_admin.log_retention.prune_failed") });
      return;
    }
    const body = (await res.json()) as {
      result: { total: number; error: number; warning: number; info: number };
    };
    setPrune({ kind: "result", ...body.result });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2 className="text-base font-semibold">{t("super_admin.log_retention.title")}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.log_retention.description")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("super_admin.log_retention.field.error_days")} htmlFor="errorDays">
          <input
            id="errorDays"
            name="errorDays"
            type="number"
            min={0}
            max={3650}
            defaultValue={retention.error}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t("super_admin.log_retention.field.warning_days")} htmlFor="warningDays">
          <input
            id="warningDays"
            name="warningDays"
            type="number"
            min={0}
            max={3650}
            defaultValue={retention.warning}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t("super_admin.log_retention.field.info_days")} htmlFor="infoDays">
          <input
            id="infoDays"
            name="infoDays"
            type="number"
            min={0}
            max={3650}
            defaultValue={retention.info}
            required
            className={inputClass}
          />
        </Field>
      </div>

      {save.kind === "error" && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {save.message}
        </p>
      )}
      {save.kind === "saved" && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          {t("super_admin.log_retention.saved")}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrune}
          disabled={prune.kind === "running"}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {prune.kind === "running"
            ? t("super_admin.log_retention.pruning")
            : t("super_admin.log_retention.prune")}
        </button>
        <button type="submit" disabled={save.kind === "saving"} className={buttonClass + " w-auto"}>
          {save.kind === "saving"
            ? t("admin.action.saving")
            : t("super_admin.log_retention.save")}
        </button>
      </div>

      {prune.kind === "error" && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {prune.message}
        </p>
      )}
      {prune.kind === "result" && (
        <p className="rounded-md bg-slate-100 p-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t("super_admin.log_retention.prune_result", {
            total: prune.total,
            plural: prune.total === 1 ? "" : "s",
            error: prune.error,
            warning: prune.warning,
            info: prune.info,
          })}
        </p>
      )}
    </form>
  );
}
