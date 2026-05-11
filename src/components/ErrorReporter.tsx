"use client";

import { useEffect } from "react";

import { reportClientLog } from "@/lib/log.client";

/**
 * Mounted once at the app root. Subscribes to the two browser-level error
 * channels so unhandled exceptions outside the React render tree (timer
 * callbacks, async handlers, top-level event listeners) are captured.
 *
 * React render errors are caught by `app/global-error.tsx` instead — this
 * component is intentionally cheap and only watches window events.
 */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const err = event.error;
      const message = event.message ?? (err instanceof Error ? err.message : String(err));
      const stack =
        err instanceof Error
          ? err.stack ?? null
          : event.filename
            ? `${message}\n    at ${event.filename}:${event.lineno}:${event.colno}`
            : null;
      void reportClientLog({
        level: "error",
        name: err instanceof Error ? err.name : null,
        message,
        stack,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : safeJson(reason);
      const stack = reason instanceof Error ? reason.stack ?? null : null;
      void reportClientLog({
        level: "error",
        name: reason instanceof Error ? reason.name : "UnhandledRejection",
        message,
        stack,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
