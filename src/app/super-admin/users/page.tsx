import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { UsersTable } from "@/components/super-admin/UsersTable";

export default async function SuperAdminUsersPage() {
  const session = await auth();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      isSuperAdmin: true,
      createdAt: true,
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-sm text-slate-500">{users.length} total</p>
      </div>
      <UsersTable
        initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        currentUserId={session!.user.id}
      />
    </section>
  );
}
