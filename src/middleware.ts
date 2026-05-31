import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED = ["/profile", "/super-admin"];
const SUPER_ADMIN_ONLY = ["/super-admin"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;
  const isSuperAdmin = req.auth?.user?.isSuperAdmin === true;

  if (!isAuthed && PROTECTED.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (
    isAuthed &&
    !isSuperAdmin &&
    SUPER_ADMIN_ONLY.some((p) => pathname.startsWith(p))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/profile";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isAuthed && AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/profile";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Exclude `api/auth-cleanup` so NextAuth's `auth()` wrapper above
  // does NOT run for that route. Inside auth(), a cryptographically-
  // valid JWT is refreshed on the response — defeating any attempt to
  // clear the session cookie. The cleanup handler at
  // `src/app/api/auth-cleanup/route.ts` runs outside this middleware
  // and can therefore actually expire the cookies before redirecting
  // to /login. Same rationale as the existing `api/auth` exclusion.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|api/auth|api/auth-cleanup).*)"],
};
