"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(body?.error ?? "Sign up failed");
      setPending(false);
      return;
    }
    const signedIn = await signIn("credentials", {
      redirect: false,
      email: data.email,
      password: data.password,
    });
    if (!signedIn || signedIn.error) {
      router.push("/login");
      return;
    }
    router.push("/profile");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="name">
        <input id="name" name="name" type="text" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
