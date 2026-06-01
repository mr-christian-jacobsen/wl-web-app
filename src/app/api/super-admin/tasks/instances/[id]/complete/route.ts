import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";

/**
 * POST /api/super-admin/tasks/instances/{id}/complete
 *
 * Admin "mark complete on behalf of" endpoint (R12, R24). Flips a
 * pending TaskInstance to `completed` with `source: 'admin'`,
 * `completedAt: new Date()`, and `completedByAdminId: session.user.id`
 * — the admin attribution column carried since U1 per the resolved-P1
 * decision.
 *
 * Status codes mirror the user-facing complete endpoint:
 *   - 401 / 403 from `requireSuperAdmin()`
 *   - 404 when the instance does not exist
 *   - 409 when the instance is already completed
 *   - 200 with the updated instance on success
 *
 * No body. The admin's identity comes from the session — the client
 * cannot supply a different `completedByAdminId`.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const existing = await prisma.taskInstance.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  if (existing.status === "completed") {
    return NextResponse.json(
      { error: "Task instance already completed" },
      { status: 409 },
    );
  }

  const updated = await prisma.taskInstance.update({
    where: { id },
    data: {
      status: "completed",
      source: "admin",
      completedAt: new Date(),
      completedByAdminId: guard.session.user.id,
    },
  });

  return NextResponse.json({ instance: updated }, { status: 200 });
}
