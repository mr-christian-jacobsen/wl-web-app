"use client";

import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";

export function SignupForm() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? t("auth.signup.error.generic"));
      setPending(false);
      return;
    }
    setSubmittedEmail(data.email!);
    setPending(false);
  }

  async function onResend() {
    if (!submittedEmail) return;
    setResendState("sending");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: submittedEmail }),
    });
    setResendState("sent");
  }

  if (submittedEmail) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {t("auth.signup.success.heading")} <strong>{submittedEmail}</strong>.{" "}
          {t("auth.signup.success.body")}
        </p>
        <p className="text-xs text-slate-500">
          {t("auth.signup.success.resend_prompt")}{" "}
          <button
            type="button"
            onClick={onResend}
            disabled={resendState !== "idle"}
            className="font-medium text-slate-700 underline disabled:opacity-60 dark:text-slate-300"
          >
            {resendState === "sent"
              ? t("auth.signup.resend.sent")
              : resendState === "sending"
                ? t("auth.signup.resend.sending")
                : t("auth.signup.resend.idle")}
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label={t("auth.signup.field.name")} htmlFor="name">
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className={inputClass}
        />
      </Field>
      <Field label={t("auth.signup.field.email")} htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </Field>
      <Field label={t("auth.signup.field.password")} htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("auth.signup.submit_pending") : t("auth.signup.submit")}
      </button>
    </form>
  );
}
