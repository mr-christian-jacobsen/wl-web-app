import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createTaskSchema, type TaskTriggerInput } from "@/lib/validators";

/**
 * Admin task definitions — list + create endpoints (U7).
 *
 * `requireSuperAdmin()` first, mirroring every other
 * /api/super-admin/* route. List returns a summary shape (counts only)
 * so the table at /super-admin/tasks renders cheaply; the editor
 * fetches the full task via `GET /api/super-admin/tasks/{id}` to get
 * the trigger array.
 *
 * Create accepts a full task with its triggers in one round-trip. The
 * editor never persists triggers separately — easier to reason about
 * partial-save failure when there's only one transaction per save.
 */

const SUMMARY_SELECT = {
  id: true,
  title: true,
  description: true,
  predicateKey: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Convert the validator's array-shaped `dates` into the DB's newline-
 * joined `dateList` column at the boundary. Other trigger shapes
 * (`signup`, `manual_assign`, `recurring`) pass through unchanged.
 * Exported via the handler — not a public helper — because the
 * `[id]` PATCH handler uses the same conversion.
 */
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

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const tasks = await prisma.task.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      ...SUMMARY_SELECT,
      _count: { select: { instances: true, triggers: true } },
    },
  });

  return NextResponse.json({
    tasks: tasks.map(({ _count, ...rest }) => ({
      ...rest,
      instanceCount: _count.instances,
      triggerCount: _count.triggers,
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      predicateKey: parsed.data.predicateKey ?? null,
      enabled: parsed.data.enabled ?? false,
      triggers: {
        create: parsed.data.triggers.map(triggerToDbRow),
      },
    },
    select: {
      ...SUMMARY_SELECT,
      _count: { select: { instances: true, triggers: true } },
    },
  });

  return NextResponse.json(
    {
      task: {
        ...task,
        instanceCount: task._count.instances,
        triggerCount: task._count.triggers,
        _count: undefined,
      },
    },
    { status: 201 },
  );
}
