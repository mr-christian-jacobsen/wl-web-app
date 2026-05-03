"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const password = new FormData(e.currentTarget).get("password");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Reset failed");
      setPending(false);
      return;
    }
    setDone(true);
    setPending(false);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        Password updated. Redirecting to login…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="New password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
