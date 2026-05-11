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
  // Nothing to initialize — logger is lazy-loaded on first error.
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
