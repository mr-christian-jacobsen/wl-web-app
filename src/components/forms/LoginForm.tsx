"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

type ResendState = "idle" | "sending" | "sent";

/**
 * Reject anything that isn't a same-origin path. `//` would resolve to
 * another origin; absolute URLs (`http://...`) must also be refused so a
 * crafted `/login?from=https://attacker` link can't redirect a successful
 * login off-site.
 */
function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/profile";
  return target;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>("idle");
  const lastEmailRef = useRef<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResendState("idle");
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    lastEmailRef.current = data.email ?? "";
    const res = await signIn("credentials", {
      redirect: false,
      email: data.email,
      password: data.password,
    });
    if (!res || res.error) {
      setError("Invalid email or password");
      setPending(false);
      return;
    }
    router.push(safeRedirect(params.get("from")));
    router.refresh();
  }

  async function onResendVerification() {
    const email = lastEmailRef.current;
    if (!email) return;
    setResendState("sending");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResendState("sent");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      {error && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-xs text-slate-500">
            Just signed up? You may need to confirm your email first.{" "}
            <button
              type="button"
              onClick={onResendVerification}
              disabled={resendState !== "idle" || !lastEmailRef.current}
              className="font-medium text-slate-700 underline disabled:opacity-60 dark:text-slate-300"
            >
              {resendState === "sent"
                ? "Confirmation sent — check your inbox."
                : resendState === "sending"
                  ? "Sending…"
                  : "Resend confirmation email"}
            </button>
          </p>
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
