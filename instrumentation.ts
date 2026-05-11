/**
 * Next.js calls `onRequestError` for every uncaught error in API routes,
 * RSC render and server actions. This single hook is enough to capture all
 * unhandled server-side exceptions — no per-route try/catch wiring needed.
 *
 * The Prisma-backed logger is dynamically imported so this file stays
 * lightweight in environments where the hook is loaded but never fires.
 */
import type { Instrumentation } from "next";

export async function register() {
  // Reflect the in-code translation registry into the DB so adding a
  // string in code automatically surfaces it in /super-admin/translations
  // on the next boot — no separate seed step or migration needed.
  //
  // Skipped on the edge runtime (no Prisma) and behind a try/catch so a
  // boot-time DB issue can't kill the whole process.
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { syncTranslationKeys } = await import("@/lib/translations.server");
    await syncTranslationKeys();
  } catch (err) {
    console.error("[translations] sync at boot failed", err);
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
) => {
  // Edge-runtime requests can't reach Prisma; bail out with a console fallback.
  if (process.env.NEXT_RUNTIME === "edge") {
    console.error("[log:edge]", request.method, request.path, err);
    return;
  }
  try {
    const { logServerError } = await import("@/lib/log.server");
    await logServerError(err, { method: request.method, path: request.path });
  } catch (loggerErr) {
    console.error("[log] instrumentation hook failed", loggerErr, err);
  }
};
