import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/notifications
 *
 * Returns the signed-in user's notifications (R13, R15) ordered
 * `createdAt DESC`, capped at 50 — the dropdown surface doesn't need
 * more, and the cap keeps the payload bounded for any user with a
 * runaway backlog.
 *
 * Always scoped to `session.user.id`. There is no `userId` query
 * parameter — cross-user enumeration is structurally impossible.
 *
 * Each row includes the linked `TaskInstance` plus its parent `Task`
 * title and the predicate's deep-link target (when present) so the bell
 * dropdown can render labels and an "open task" link in one round-trip.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      type: true,
      taskInstanceId: true,
      unread: true,
      createdAt: true,
      taskInstance: {
        select: {
          id: true,
          status: true,
          task: {
            select: { id: true, title: true, predicateKey: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ notifications });
}
