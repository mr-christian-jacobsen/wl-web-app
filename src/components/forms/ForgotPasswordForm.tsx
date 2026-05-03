"use client";

import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    setSubmitted(true);
    setPending(false);
  }

  if (submitted) {
    return (
      <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        If an account exists for that email, a reset link has been sent. Check your inbox (and the
        Mailpit UI in development).
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
