import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAMES } from "@/lib/auth.cookies";

/**
 * Clear stale NextAuth session cookies and redirect.
 *
 * Why this exists: when a session cookie is cryptographically valid
 * but the user it points at has been deleted from the database
 * (db wiped, user deleted, AUTH_URL/AUTH_SECRET rotated between
 * sessions), the server-component guard at `/profile/page.tsx`
 * sees `auth()` return a session, then fails to resolve the user.
 * It needs to send the user to `/login` while clearing the bad
 * cookie. But:
 *
 * - Server components cannot mutate cookies in Next.js 15 — only
 *   server actions and route handlers can.
 * - A redirect to `/login` through the normal middleware does not
 *   clear the cookie, because NextAuth's `auth()` middleware wrapper
 *   refreshes the session cookie on every request whose JWT is
 *   still cryptographically valid. Any `res.cookies.delete()` we add
 *   in middleware loses to the refresh that auth() emits last.
 *
 * This route handler bypasses the auth() wrapper entirely (the
 * matcher in `src/middleware.ts` excludes `api/auth-cleanup`) so it
 * can clear the cookies cleanly and 307 the user to `/login`.
 *
 * Callers: redirect to `/api/auth-cleanup?next=/login` (or any safe
 * relative path; the handler validates `next` is same-origin to
 * prevent open-redirect abuse).
 */
export function GET(req: NextRequest): Response {
  const nextParam = req.nextUrl.searchParams.get("next") ?? "/login";
  // Only accept same-origin relative paths — prevents this endpoint
  // becoming an open redirector if a caller ever passes an external URL.
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/login";

  const target = new URL(safeNext, req.nextUrl.origin);
  const res = NextResponse.redirect(target, 307);

  for (const name of AUTH_COOKIE_NAMES) {
    res.cookies.delete(name);
  }

  return res;
}
