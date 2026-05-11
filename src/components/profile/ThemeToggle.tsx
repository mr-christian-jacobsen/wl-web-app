"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

type ThemeMode = "light" | "dark" | "system";

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

function applyToDocument(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else if (mode === "light") {
    root.classList.remove("dark");
  } else {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", systemDark);
  }
}

export function ThemeToggle({ initial }: { initial: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initial);
  const [pending, setPending] = useState<ThemeMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { update } = useSession();

  async function onPick(next: ThemeMode) {
    if (next === mode) return;
    setPending(next);
    setError(null);
    // Optimistic UI: flip the class first so the user sees the change instantly.
    const prevMode = mode;
    setMode(next);
    applyToDocument(next);

    const res = await fetch("/api/profile/theme", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      // Roll back the optimistic flip.
      setMode(prevMode);
      applyToDocument(prevMode);
      setError(body?.error ?? "Could not save theme");
      setPending(null);
      return;
    }
    const body = (await res.json()) as { themePreference: string | null };
    // Refresh the JWT/session so other tabs / future SSR see the new value.
    await update({ themePreference: body.themePreference });
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex w-full overflow-hidden rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950 sm:w-auto"
      >
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPick(opt.value)}
              disabled={pending !== null}
              className={
                "flex flex-1 items-center justify-center gap-2 rounded-[5px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed sm:flex-none " +
                (active
                  ? "bg-slate-900 text-white shadow dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              <span className="shrink-0">{opt.icon}</span>
              <span>{opt.label}</span>
              {pending === opt.value && (
                <span className="text-xs opacity-70">…</span>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
