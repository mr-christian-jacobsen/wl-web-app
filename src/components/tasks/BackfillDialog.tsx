"use client";

import { useEffect, useState } from "react";

import { buttonClass } from "@/components/AuthCard";

/**
 * Confirm dialog rendered when an admin enables a previously-disabled
 * task definition (U5). The U7 task editor opens this when the
 * `enabled` toggle goes false → true; on confirm the dialog calls
 * `POST /api/super-admin/tasks/{id}/enable` with the chosen
 * `notify` flag and then dismisses on the resulting 202.
 *
 * Flow:
 *   1. On open, fetch the eligible count via
 *      `GET /api/super-admin/tasks/{id}/enable/count`.
 *   2. Render "Enable this task. N users will get an instance." with
 *      two buttons (default focus: silent).
 *   3. Clicking Notify shows a secondary confirmation
 *      ("Send N emails immediately?") per the doc-review
 *      email-blast-throttle finding — keeps the dialog itself the
 *      throttle point.
 *   4. On confirm, POST `{ notify }` to the enable endpoint. 202 →
 *      `onConfirmed`; 422 EMAIL_CAP_EXCEEDED → surface a structured
 *      error with the cap value and an action hint; other 4xx/5xx →
 *      generic error copy that retains the dialog.
 *
 * The component is self-contained — no router, no global state. The
 * U7 editor passes `taskId` + a callback for after success.
 */

type Phase =
  | { kind: "loading" }
  | { kind: "loadError"; message: string }
  | { kind: "ready"; count: number }
  | { kind: "confirmNotify"; count: number }
  | { kind: "submitting"; intent: "silent" | "notify"; count: number }
  | {
      kind: "submitError";
      count: number;
      intent: "silent" | "notify";
      message: string;
      cap?: number;
      eligible?: number;
    };

export function BackfillDialog({
  taskId,
  onConfirmed,
  onClose,
}: {
  taskId: string;
  onConfirmed: (info: { notify: boolean; eligible: number }) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  // Fetch the count on mount. `useEffect` rather than a Server Component
  // hand-off because BackfillDialog is invoked imperatively by the U7
  // editor's enable-toggle handler — we don't have an SSR boundary to
  // pre-fetch through. Errors land in `loadError` and surface as a
  // dismissible card so admins know the dialog isn't operable rather
  // than silently showing "0 users".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/super-admin/tasks/${encodeURIComponent(taskId)}/enable/count`,
          { method: "GET" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!cancelled) {
            setPhase({
              kind: "loadError",
              message: body?.error ?? `Could not load count (HTTP ${res.status})`,
            });
          }
          return;
        }
        const body = (await res.json()) as { count: number };
        if (!cancelled) setPhase({ kind: "ready", count: body.count });
      } catch (err) {
        if (!cancelled) {
          setPhase({
            kind: "loadError",
            message: err instanceof Error ? err.message : "Network error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function submit(intent: "silent" | "notify", count: number) {
    setPhase({ kind: "submitting", intent, count });
    try {
      const res = await fetch(
        `/api/super-admin/tasks/${encodeURIComponent(taskId)}/enable`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notify: intent === "notify" }),
        },
      );
      if (res.status === 202) {
        const body = (await res.json().catch(() => null)) as {
          eligible?: number;
        } | null;
        onConfirmed({
          notify: intent === "notify",
          eligible: body?.eligible ?? count,
        });
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        cap?: number;
        eligible?: number;
        action?: string;
      } | null;
      // 422 + EMAIL_CAP_EXCEEDED gets the dedicated copy with the cap
      // and the suggested action. Other errors fall through to the
      // generic message branch.
      if (res.status === 422 && body?.code === "EMAIL_CAP_EXCEEDED") {
        setPhase({
          kind: "submitError",
          intent,
          count,
          message:
            body.action ??
            "Email cap exceeded — raise tasks.backfill.maxEmailsPerEnable or run silent then notify selectively",
          cap: body.cap,
          eligible: body.eligible,
        });
        return;
      }
      setPhase({
        kind: "submitError",
        intent,
        count,
        message: body?.error ?? `Failed to enable task (HTTP ${res.status})`,
      });
    } catch (err) {
      setPhase({
        kind: "submitError",
        intent,
        count,
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase.kind !== "submitting") {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="backfill-dialog-title"
    >
      <div className="my-8 flex w-full max-w-md flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <h3 id="backfill-dialog-title" className="text-lg font-semibold">
          Enable this task
        </h3>

        {phase.kind === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Spinner />
            <span>Counting users…</span>
          </div>
        )}

        {phase.kind === "loadError" && (
          <>
            <p className="text-sm text-red-700 dark:text-red-300">
              {phase.message}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </>
        )}

        {(phase.kind === "ready" ||
          phase.kind === "submitting" ||
          phase.kind === "submitError") &&
          phase.kind !== "submitError" && (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong>{phase.count}</strong>{" "}
                {phase.count === 1 ? "user" : "users"} will get an instance.
                Notify them (in-app + email) or backfill silently?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {/* Silent is the default focus per U5 spec. */}
                <button
                  type="button"
                  autoFocus
                  disabled={phase.kind === "submitting"}
                  onClick={() => submit("silent", phase.count)}
                  className={buttonClass + " sm:w-auto"}
                >
                  {phase.kind === "submitting" && phase.intent === "silent"
                    ? "Enabling…"
                    : "Enable silently"}
                </button>
                <button
                  type="button"
                  disabled={phase.kind === "submitting"}
                  onClick={() =>
                    setPhase({ kind: "confirmNotify", count: phase.count })
                  }
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Notify users
                </button>
                <button
                  type="button"
                  disabled={phase.kind === "submitting"}
                  onClick={onClose}
                  className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

        {phase.kind === "confirmNotify" && (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Send <strong>{phase.count}</strong> emails immediately? This
              dispatches the in-app notification and queues the email send
              for each user who has not opted out.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => submit("notify", phase.count)}
                className={buttonClass + " sm:w-auto"}
              >
                Yes, send {phase.count} emails
              </button>
              <button
                type="button"
                onClick={() =>
                  setPhase({ kind: "ready", count: phase.count })
                }
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Back
              </button>
            </div>
          </>
        )}

        {phase.kind === "submitError" && (
          <>
            <p className="text-sm text-red-700 dark:text-red-300">
              {phase.message}
            </p>
            {phase.cap !== undefined && phase.eligible !== undefined && (
              <p className="text-xs text-slate-500">
                Eligible: <strong>{phase.eligible}</strong>. Cap:{" "}
                <strong>{phase.cap}</strong>.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => submit(phase.intent, phase.count)}
                className={buttonClass + " sm:w-auto"}
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-100"
      aria-hidden="true"
    />
  );
}
