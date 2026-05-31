import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationBellSlot } from "@/components/notifications/NotificationBellSlot";
import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/translations.server";

/**
 * Shared chrome for every authed end-user page (`/profile`, `/tasks`,
 * future personal pages). Defence-in-depth: middleware already
 * redirects unauthenticated traffic for `/profile` and `/tasks` to
 * `/login`, but the layout re-checks `auth()` so adding a new
 * `(dashboard)` page automatically inherits the gate even if the
 * middleware matcher is ever loosened.
 *
 * The header carries a single nav strip: app-name link (`/`),
 * `/profile`, `/tasks`, and a `<NotificationBellSlot />` placeholder.
 * U11 replaces the slot import with the real `<NotificationBell />`
 * without touching the layout shape.
 *
 * Admin users keep their own chrome from `src/app/super-admin/layout.tsx`
 * — that layout sits in a sibling route group and is unaffected here.
 * The `Back to admin` shortcut for admins lives on the existing
 * `/profile` page; the dashboard header itself stays simple so it
 * doesn't conditionally vary per role.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const t = await getServerT();

  const links: Array<{ href: string; key: string }> = [
    { href: "/profile", key: "dashboard.nav.profile" },
    { href: "/tasks", key: "dashboard.nav.tasks" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 py-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300"
        >
          {t("dashboard.nav.app_name")}
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t(l.key)}
            </Link>
          ))}
          <NotificationBellSlot />
        </nav>
      </header>
      {children}
    </div>
  );
}
