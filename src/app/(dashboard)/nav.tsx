"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/flows", label: "Flows" },
  { href: "/profile", label: "Profile" },
] as const;

export function DashboardNav({
  children,
}: {
  isSuperAdmin: boolean;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-md px-3 py-1.5 font-medium " +
              (active
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800")
            }
          >
            {tab.label}
          </Link>
        );
      })}
      {children}
    </nav>
  );
}
