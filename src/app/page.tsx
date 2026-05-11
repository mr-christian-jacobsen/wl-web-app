import Link from "next/link";

import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/translations.server";

export default async function HomePage() {
  const session = await auth();
  const t = await getServerT();

  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t("home.title")}</h1>
      <p className="mt-4 max-w-prose text-balance text-base text-slate-600 dark:text-slate-300 sm:text-lg">
        {t("home.tagline")}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {session ? (
          <Link
            href="/profile"
            className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {t("home.cta.go_to_profile")}
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {t("home.cta.create_account")}
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {t("home.cta.log_in")}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
