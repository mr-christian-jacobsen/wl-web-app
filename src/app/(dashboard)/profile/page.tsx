import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";
import { getServerT } from "@/lib/translations.server";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Make sure the default language exists so the picker always has at
  // least one option, even on a brand-new database.
  await ensureDefaultLanguage();

  const [user, languages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isSuperAdmin: true,
        languageId: true,
        themePreference: true,
      },
    }),
    prisma.language.findMany({
      orderBy: [{ isDefault: "desc" }, { countryCode: "asc" }, { languageCode: "asc" }],
      select: { id: true, countryCode: true, languageCode: true, isDefault: true },
    }),
  ]);
  if (!user) {
    // Session token decoded but the user no longer exists in this DB
    // (db wiped, user deleted, AUTH_URL/AUTH_SECRET rotated). Route
    // through `/api/auth-cleanup` to clear the stale cookie before
    // landing on /login — without that, the middleware would see the
    // cryptographically-valid JWT, redirect /login → /profile, and
    // we'd loop forever (ERR_TOO_MANY_REDIRECTS). The cleanup route
    // is excluded from middleware so NextAuth's auth() wrapper does
    // not refresh the cookie before we get to delete it.
    redirect("/api/auth-cleanup?next=/login");
  }

  const t = await getServerT();

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("profile.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("profile.subtitle")}
          </p>
        </div>
        {user.isSuperAdmin && (
          <Link
            href="/super-admin"
            className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 sm:self-auto"
          >
            {t("profile.super_admin_link")}
          </Link>
        )}
      </header>
      <ProfileEditor user={user} languages={languages} />
    </section>
  );
}
