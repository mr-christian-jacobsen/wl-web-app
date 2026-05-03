import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login?from=/super-admin");
  if (!session.user.isSuperAdmin) redirect("/profile");

  return (
    <div className="flex flex-1 flex-col gap-6 py-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Super admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Administration</h1>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/super-admin"
            className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Overview
          </Link>
          <Link
            href="/super-admin/users"
            className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Users
          </Link>
          <Link
            href="/super-admin/email-templates"
            className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Email templates
          </Link>
          <Link
            href="/super-admin/emails"
            className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Emails
          </Link>
          <Link
            href="/super-admin/usage"
            className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Usage
          </Link>
          <Link
            href="/super-admin/system-settings"
            className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            System settings
          </Link>
          <Link
            href="/profile"
            className="rounded-md px-3 py-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ← Back to profile
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
