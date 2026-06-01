import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTaskEditor } from "@/components/tasks/AdminTaskEditor";
import { prisma } from "@/lib/db";

/**
 * /super-admin/tasks/[id] — editor (U7). Server-fetches the task with
 * its trigger list, hands off to the client editor for the form.
 *
 * 404 on unknown id (same shape as the survey editor). The layout
 * guard handles auth.
 */
export default async function TaskEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      predicateKey: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
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
  if (!task) notFound();

  return (
    <section className="flex w-full flex-col gap-6">
      <Link
        href="/super-admin/tasks"
        className="text-sm text-slate-500 hover:underline"
      >
        ← All tasks
      </Link>
      <AdminTaskEditor
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          predicateKey: task.predicateKey,
          enabled: task.enabled,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          // The DB stores `kind` as a String — narrow to the editor's
          // union here. Unknown kinds (impossible under the validator
          // contract, but defensive) collapse to "signup" so the editor
          // can still render and the admin can re-pick.
          triggers: task.triggers.map((tr) => ({
            id: tr.id,
            kind: normalizeTriggerKind(tr.kind),
            intervalDays: tr.intervalDays,
            dateList: tr.dateList,
          })),
          instanceCount: task._count.instances,
        }}
      />
    </section>
  );
}

function normalizeTriggerKind(
  kind: string,
): "signup" | "manual_assign" | "recurring" | "specific_date" {
  if (
    kind === "signup" ||
    kind === "manual_assign" ||
    kind === "recurring" ||
    kind === "specific_date"
  ) {
    return kind;
  }
  return "signup";
}
