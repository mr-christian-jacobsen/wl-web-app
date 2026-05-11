import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/translations.server";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login?from=/super-admin");
  if (!session.user.isSuperAdmin) redirect("/profile");

  const t = await getServerT();

  // Single place to declare nav links so the markup stays compact and
  // adding/reordering doesn't require editing two parallel arrays.
  const links: Array<{ href: string; key: string; muted?: boolean }> = [
    { href: "/super-admin", key: "super_admin.nav.overview" },
    { href: "/super-admin/users", key: "super_admin.nav.users" },
    { href: "/super-admin/surveys", key: "super_admin.nav.surveys" },
    { href: "/super-admin/languages", key: "super_admin.nav.languages" },
    { href: "/super-admin/translations", key: "super_admin.nav.translations" },
    { href: "/super-admin/email-templates", key: "super_admin.nav.email_templates" },
    { href: "/super-admin/emails", key: "super_admin.nav.emails" },
    { href: "/super-admin/usage", key: "super_admin.nav.usage" },
    { href: "/super-admin/errors", key: "super_admin.nav.errors" },
    { href: "/super-admin/system-settings", key: "super_admin.nav.system_settings" },
    { href: "/profile", key: "super_admin.nav.back_to_profile", muted: true },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 py-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("super_admin.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {t("super_admin.title")}
          </h1>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                "rounded-md px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 " +
                (l.muted
                  ? "text-slate-500"
                  : "text-slate-700 dark:text-slate-200")
              }
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
