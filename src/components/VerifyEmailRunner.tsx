"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type State =
  | { kind: "pending" }
  | { kind: "ok"; purpose: "signup" | "change" }
  | { kind: "error"; message: string };

export function VerifyEmailRunner({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "pending" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setState({ kind: "error", message: body?.error ?? "Verification failed" });
        return;
      }
      const body = (await res.json()) as { purpose: "signup" | "change" };
      setState({ kind: "ok", purpose: body.purpose });
    })();
  }, [token]);

  if (state.kind === "pending") {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Confirming…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
        {state.message}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        {state.purpose === "signup"
          ? "Your email is verified. You can sign in now."
          : "Your new email address is confirmed. Sign in again with the new email."}
      </p>
      <Link
        href="/login"
        className="rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        Go to sign in
      </Link>
    </div>
  );
}
