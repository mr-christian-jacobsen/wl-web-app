"use client";

import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

export type SmtpSettingsView = {
  host: string | undefined;
  port: number | undefined;
  user: string | undefined;
  hasPassword: boolean;
  from: string | undefined;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type TestState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "result"; status: string; error: string | null }
  | { kind: "error"; message: string };

export function SmtpSettingsForm({ initial }: { initial: SmtpSettingsView }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [testTo, setTestTo] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSave({ kind: "saving" });
    const fd = new FormData(e.currentTarget);
    const portRaw = String(fd.get("port") ?? "").trim();
    const portNum = portRaw === "" ? null : Number(portRaw);
    const payload = {
      host: String(fd.get("host") ?? ""),
      port: portNum === null ? "" : portNum,
      user: String(fd.get("user") ?? ""),
      // Empty string = leave existing password alone (matches schema convention).
      pass: String(fd.get("pass") ?? ""),
      from: String(fd.get("from") ?? ""),
    };

    const res = await fetch("/api/super-admin/system-settings/smtp", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setSave({ kind: "error", message: body?.error ?? t("super_admin.log_retention.save_failed") });
      return;
    }
    const body = (await res.json()) as { settings: SmtpSettingsView };
    setSettings(body.settings);
    setSave({ kind: "saved" });
  }

  async function onTest() {
    if (!testTo) {
      setTest({ kind: "error", message: t("super_admin.smtp.test_failed") });
      return;
    }
    setTest({ kind: "sending" });
    const res = await fetch("/api/super-admin/system-settings/smtp/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: testTo }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setTest({ kind: "error", message: body?.error ?? t("super_admin.smtp.test_failed") });
      return;
    }
    const body = (await res.json()) as { outcome: { status: string; error: string | null } };
    setTest({ kind: "result", status: body.outcome.status, error: body.outcome.error });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <h2 className="text-base font-semibold">{t("super_admin.smtp.title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("super_admin.smtp.description")}
          </p>
        </div>

        <Field label={t("super_admin.smtp.field.host")} htmlFor="host">
          <input
            id="host"
            name="host"
            defaultValue={settings.host ?? ""}
            placeholder="smtp.resend.com"
            className={inputClass}
          />
        </Field>

        <Field label={t("super_admin.smtp.field.port")} htmlFor="port">
          <input
            id="port"
            name="port"
            type="number"
            min={1}
            max={65535}
            defaultValue={settings.port ?? ""}
            placeholder="465"
            className={inputClass}
          />
        </Field>

        <Field label={t("super_admin.smtp.field.user")} htmlFor="user">
          <input
            id="user"
            name="user"
            defaultValue={settings.user ?? ""}
            placeholder="resend"
            className={inputClass}
          />
        </Field>

        <Field label={t("super_admin.smtp.field.pass")} htmlFor="pass">
          <input
            id="pass"
            name="pass"
            type="password"
            autoComplete="new-password"
            placeholder={
              settings.hasPassword
                ? t("super_admin.smtp.pass.set_placeholder")
                : t("super_admin.smtp.pass.unset_placeholder")
            }
            className={inputClass}
          />
        </Field>

        <Field label={t("super_admin.smtp.field.from")} htmlFor="from">
          <input
            id="from"
            name="from"
            defaultValue={settings.from ?? ""}
            placeholder="onboarding@resend.dev"
            className={inputClass}
          />
        </Field>

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

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={save.kind === "saving"}
            className={buttonClass + " w-auto"}
          >
            {save.kind === "saving"
              ? t("admin.action.saving")
              : t("super_admin.smtp.save")}
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-semibold">{t("super_admin.smtp.test")}</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="recipient@example.com"
            className={inputClass + " sm:flex-1"}
          />
          <button
            type="button"
            onClick={onTest}
            disabled={test.kind === "sending" || !testTo}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {test.kind === "sending"
              ? t("super_admin.smtp.testing")
              : t("super_admin.smtp.test")}
          </button>
        </div>
        {test.kind === "error" && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            {test.message}
          </p>
        )}
        {test.kind === "result" && (
          <div
            className={
              "rounded-md p-2 text-sm " +
              (test.status === "sent"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                : test.status === "skipped"
                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200")
            }
          >
            <p>
              {t(`super_admin.emails.status.${test.status}`)}
            </p>
            {test.error && <p className="mt-1 font-mono text-xs">{test.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
