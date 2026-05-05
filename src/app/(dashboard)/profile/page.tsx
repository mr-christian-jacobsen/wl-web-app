import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, avatarUrl: true, isSuperAdmin: true },
  });
  if (!user) redirect("/login");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your profile</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Update your name, email, password, and avatar.
          </p>
        </div>
        {user.isSuperAdmin && (
          <Link
            href="/super-admin"
            className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 sm:self-auto"
          >
            Super admin →
          </Link>
        )}
      </header>
      <ProfileEditor user={user} />
    </section>
  );
}
