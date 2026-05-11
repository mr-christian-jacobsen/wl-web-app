"use client";

import { useEffect } from "react";

import { reportClientLog } from "@/lib/log.client";

/**
 * Root error boundary. Renders only when an error escapes every nested
 * `error.tsx`. Reports the error to /api/log on mount, then offers a "Try
 * again" button that calls the framework-supplied `reset` to attempt a
 * re-render of the failing tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientLog({
      level: "error",
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      context: { digest: error.digest, source: "global-error" },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            We've logged the error. You can try again, or reload the page.
          </p>
          {error.digest && (
            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {error.digest}
            </code>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
