import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  TasksSchedulerDisabledError,
  manuallyAssignInstance,
} from "@/lib/tasks";
import { assignTaskInstanceSchema } from "@/lib/validators";

/**
 * POST /api/super-admin/tasks/{id}/assign
 *
 * Admin manual-assign endpoint (R8 revised, AE5 / AE5b). Creates a
 * pending TaskInstance for the chosen user; the predicate (if any) is
 * evaluated immediately and a matching predicate flips the row to
 * `completed` with `source: 'predicate'` silently. Otherwise the
 * notification + email dispatch fires through the unified path.
 *
 * Returns 201 with the created instance regardless of whether it ended
 * up pending or completed — the response shape carries `status` so the
 * admin UI can render a "task completed silently because the user
 * already satisfies the predicate" toast.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id: taskId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = assignTaskInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Verify the task definition exists. 404 mirrors surveys / languages /
  // email-templates and lets the admin client tell "wrong id" apart from
  // "right id, validation failed".
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Verify the target user exists. Same 404 treatment as above; the
  // alternative (let the FK fail with P2003) would surface a less
  // helpful error message to the admin UI.
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const instance = await manuallyAssignInstance(
      taskId,
      parsed.data.userId,
      guard.session.user.id,
    );
    return NextResponse.json({ instance }, { status: 201 });
  } catch (err) {
    if (err instanceof TasksSchedulerDisabledError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "SCHEDULER_DISABLED",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
