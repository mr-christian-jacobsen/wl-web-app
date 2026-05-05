import Link from "next/link";

import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">wl-web-app</h1>
      <p className="mt-4 max-w-prose text-balance text-base text-slate-600 dark:text-slate-300 sm:text-lg">
        A responsive Node.js + TypeScript starter with sign-up, login, password reset, and a
        profile area for updating your name, email, password, and avatar.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {session ? (
          <Link
            href="/profile"
            className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Go to profile
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
