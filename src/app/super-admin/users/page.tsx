import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";

import { UsersTable } from "@/components/super-admin/UsersTable";

export default async function SuperAdminUsersPage() {
  const session = await auth();

  // Languages are needed by the create/edit dialog picker; seed the
  // default so a fresh DB always has at least one option.
  await ensureDefaultLanguage();

  const [users, languages] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        isSuperAdmin: true,
        languageId: true,
        createdAt: true,
      },
    }),
    prisma.language.findMany({
      orderBy: [{ isDefault: "desc" }, { countryCode: "asc" }, { languageCode: "asc" }],
      select: { id: true, countryCode: true, languageCode: true, isDefault: true },
    }),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-sm text-slate-500">{users.length} total</p>
      </div>
      <UsersTable
        initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        languages={languages}
        currentUserId={session!.user.id}
      />
    </section>
  );
}
