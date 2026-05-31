/**
 * Names of the cookies NextAuth v5 sets, including the `__Secure-` /
 * `__Host-` HTTPS variants.
 *
 * Lives in its own module (not `src/lib/auth.ts`) because the edge
 * middleware needs to import these names to clear stale auth cookies
 * (see `src/middleware.ts`), and per `CLAUDE.md` the middleware must
 * never import `src/lib/auth.ts` — that module pulls in argon2 and
 * Prisma, which breaks the edge bundle.
 */
export const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
] as const;
