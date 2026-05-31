import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/tasks
 *
 * Returns the signed-in user's task instances grouped by `status`,
 * each instance enriched with the parent Task's title / description /
 * predicateKey so the client can render without a second round-trip.
 *
 * Always scoped to `session.user.id` — there is no `userId` query
 * parameter. Cross-user enumeration is structurally impossible: any
 * `userId` the client tries to pass is ignored. Matches the IDOR
 * boundary rule the plan calls out for `/api/tasks/{id}/complete`.
 *
 * 401 when no session. Both arrays are sorted `createdAt DESC` so the
 * most recently created instance is first within each group.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SELECT = {
    id: true,
    taskId: true,
    userId: true,
    status: true,
    source: true,
    signature: true,
    completedAt: true,
    assignedByAdminId: true,
    completedByAdminId: true,
    createdAt: true,
    updatedAt: true,
    task: {
      select: { title: true, description: true, predicateKey: true },
    },
  } as const;

  const [pending, completed] = await Promise.all([
    prisma.taskInstance.findMany({
      where: { userId: session.user.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    }),
    prisma.taskInstance.findMany({
      where: { userId: session.user.id, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    }),
  ]);

  return NextResponse.json({ pending, completed });
}
