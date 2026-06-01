import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { updateTaskSchema, type TaskTriggerInput } from "@/lib/validators";

/**
 * Admin task definition — get / update / delete (U7).
 *
 * GET returns the task with its trigger list (the editor needs both).
 * PATCH accepts partial fields; when `triggers` is present the whole
 * trigger list is replaced in a single transaction.
 * DELETE refuses (409) if any TaskInstance row references the task —
 * mirrors the Language delete-refuse-on-children pattern so admins
 * can't accidentally erase user-visible history.
 *
 * `Task.onDelete: Restrict` on TaskInstance means the DB would refuse
 * anyway; we check up front to surface a clear message and a code the
 * UI can act on.
 *
 * Trigger storage shape (KTD3 + U7): wire format uses
 * `dates: string[]` for specific_date; DB column is `dateList` (newline-
 * joined YYYY-MM-DD). Conversion happens at this boundary.
 */

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  predicateKey: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

function triggerToDbRow(t: TaskTriggerInput): {
  kind: string;
  intervalDays: number | null;
  dateList: string | null;
} {
  if (t.kind === "recurring") {
    return { kind: "recurring", intervalDays: t.intervalDays, dateList: null };
  }
  if (t.kind === "specific_date") {
    return { kind: "specific_date", intervalDays: null, dateList: t.dates.join("\n") };
  }
  return { kind: t.kind, intervalDays: null, dateList: null };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      ...TASK_SELECT,
      triggers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          intervalDays: true,
          dateList: true,
        },
      },
      _count: { select: { instances: true } },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    task: {
      ...task,
      instanceCount: task._count.instances,
      _count: undefined,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Build the scalar-field update; triggers are handled separately
  // because the relation needs delete+create in one transaction.
  const data: Prisma.TaskUpdateInput = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description ?? null;
  }
  if (parsed.data.predicateKey !== undefined) {
    data.predicateKey = parsed.data.predicateKey ?? null;
  }
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;

  try {
    const task = await prisma.$transaction(async (tx) => {
      if (parsed.data.triggers !== undefined) {
        await tx.taskTrigger.deleteMany({ where: { taskId: id } });
        await tx.task.update({
          where: { id },
          data: {
            ...data,
            triggers: { create: parsed.data.triggers.map(triggerToDbRow) },
          },
          select: { id: true },
        });
      } else if (Object.keys(data).length > 0) {
        await tx.task.update({
          where: { id },
          data,
          select: { id: true },
        });
      }

      // Re-read with the full include so the response shape matches GET.
      return tx.task.findUniqueOrThrow({
        where: { id },
        select: {
          ...TASK_SELECT,
          triggers: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              kind: true,
              intervalDays: true,
              dateList: true,
            },
          },
          _count: { select: { instances: true } },
        },
      });
    });

    return NextResponse.json({
      task: {
        ...task,
        instanceCount: task._count.instances,
        _count: undefined,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  // Up-front 409 with a clear message (mirrors the language-delete
  // pattern). The DB would refuse anyway via `onDelete: Restrict` on
  // TaskInstance, but the prisma constraint error is opaque to the UI.
  const existing = await prisma.task.findUnique({
    where: { id },
    select: { id: true, _count: { select: { instances: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (existing._count.instances > 0) {
    return NextResponse.json(
      {
        error: `This task has ${existing._count.instances} instance${existing._count.instances === 1 ? "" : "s"}. Remove or complete those first before deleting the definition.`,
        code: "HAS_INSTANCES",
        instanceCount: existing._count.instances,
      },
      { status: 409 },
    );
  }

  try {
    // Triggers cascade with the task (onDelete: Cascade in schema).
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    throw err;
  }
}
