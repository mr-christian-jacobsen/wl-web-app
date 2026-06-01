import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/tasks/{id}/complete
 *
 * User-initiated mark-complete (R10). Flips the instance to
 * `completed` with `source: 'user'` and stamps `completedAt`.
 *
 * IDOR boundary: an instance the caller doesn't own returns 404 (not
 * 403) so the endpoint never confirms the existence of a row belonging
 * to another user. Already-completed instances return 409 so the
 * client can distinguish "race / double-click" from a true failure.
 *
 * Translation context-bridge note: `Notification`s for this instance
 * stay as-is — the user-initiated complete path doesn't fire or
 * acknowledge notifications, mirroring R11's pattern for predicate-
 * driven auto-complete.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.taskInstance.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  // IDOR boundary: collapse "not found" and "not yours" into the same
  // 404 so the endpoint can't be used to probe other users' instance ids.
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status === "completed") {
    return NextResponse.json(
      { error: "Task already completed" },
      { status: 409 },
    );
  }

  const updated = await prisma.taskInstance.update({
    where: { id },
    data: {
      status: "completed",
      source: "user",
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ instance: updated }, { status: 200 });
}
