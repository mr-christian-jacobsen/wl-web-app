import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { DashboardNav } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-1 flex-col gap-6 py-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Signed in as {session.user.email}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">wl-web-app</h1>
        </div>
        <DashboardNav isSuperAdmin={session.user.isSuperAdmin}>
          {session.user.isSuperAdmin && (
            <Link
              href="/super-admin"
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Super admin →
            </Link>
          )}
        </DashboardNav>
      </header>
      {children}
    </div>
  );
}
