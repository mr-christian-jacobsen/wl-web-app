import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { countBackfillTargets } from "@/lib/tasks";

/**
 * GET /api/super-admin/tasks/{id}/enable/count
 *
 * Returns the number of users who would receive a TaskInstance if this
 * task were enabled right now — i.e. users without an open pending
 * instance for this task. Drives the BackfillDialog's
 * "N users will get an instance" copy and, on the enable endpoint
 * itself, the `maxEmailsPerEnable` pre-check input.
 *
 * Returns `{ count }` so the client doesn't have to read a single-key
 * top-level number — same shape as the surveys count endpoints.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id: taskId } = await params;

  // Verify the task exists so the admin client can tell "wrong id"
  // apart from "right id, zero targets" — same 404 treatment as the
  // assign endpoint.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const count = await countBackfillTargets(taskId);
  return NextResponse.json({ count });
}
