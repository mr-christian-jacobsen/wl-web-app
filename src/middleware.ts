import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

const PROTECTED = ["/profile"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;

  if (!isAuthed && PROTECTED.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|api/auth).*)"],
};
