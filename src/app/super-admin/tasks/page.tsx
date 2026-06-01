import { TasksList } from "@/components/super-admin/TasksList";
import { prisma } from "@/lib/db";
import { getServerT } from "@/lib/translations.server";

/**
 * /super-admin/tasks — definition list (U7). The layout already enforces
 * `requireSuperAdmin()`; we don't repeat the guard here.
 *
 * Mirrors `src/app/super-admin/surveys/page.tsx` end-to-end: server-
 * fetch a summary shape (counts only, no triggers), hand it to a client
 * component that owns inline create + per-row delete. The editor lives
 * at `/super-admin/tasks/[id]` and is fetched on demand.
 */
export default async function TasksPage() {
  const tasks = await prisma.task.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      predicateKey: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { instances: true, triggers: true } },
    },
  });

  const initial = tasks.map(({ _count, createdAt, updatedAt, ...rest }) => ({
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    instanceCount: _count.instances,
    triggerCount: _count.triggers,
  }));

  const t = await getServerT();

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("super_admin.tasks.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.tasks.description")}
        </p>
      </div>
      <TasksList initial={initial} />
    </section>
  );
}
