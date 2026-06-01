import { AdminInstanceTable } from "@/components/tasks/AdminInstanceTable";
import { prisma } from "@/lib/db";
import { getServerT } from "@/lib/translations.server";
import { instanceListQuerySchema } from "@/lib/validators";

/**
 * /super-admin/tasks/instances — admin global instance overview (U8).
 *
 * The layout already enforces `requireSuperAdmin()`; we don't repeat
 * the guard here. Mirrors `/super-admin/usage` and `/super-admin/errors`
 * for the "admin view of per-user rows with filters" precedent: the
 * server component parses search params into the same Zod schema the
 * API endpoint uses, fetches the first page, then hands an initial
 * snapshot to the client table.
 *
 * Filter state lives in the URL via search params so admins can deep-
 * link a filtered view to teammates. The client table re-fetches via
 * the API when filters change (no full page reload) but also updates
 * the URL so refresh + back/forward behave as expected.
 *
 * Cursor pagination starts here — the page consumes the same schema
 * as the API and seeds `initialCursor`/`initialInstances` so the
 * client can render without an extra fetch on first load.
 */
export default async function AdminTaskInstancesPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    taskId?: string;
    status?: string;
    cursor?: string;
    limit?: string;
  }>;
}) {
  const t = await getServerT();
  const raw = await searchParams;
  // `safeParse` so a tampered URL just falls back to defaults — better
  // than throwing on the admin page.
  const parsed = instanceListQuerySchema.safeParse(raw);
  const filters = parsed.success
    ? parsed.data
    : instanceListQuerySchema.parse({});

  const whereParts: Array<Record<string, unknown>> = [];
  if (filters.userId) whereParts.push({ userId: filters.userId });
  if (filters.taskId) whereParts.push({ taskId: filters.taskId });
  if (filters.status) whereParts.push({ status: filters.status });

  // Pull a page +1 so we can determine the next cursor in the server
  // render. The API endpoint does the same — server + API share the
  // same pagination shape.
  const rows = await prisma.taskInstance.findMany({
    where: whereParts.length > 0 ? { AND: whereParts } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
    select: {
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
      user: { select: { id: true, email: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });

  const hasNext = rows.length > filters.limit;
  const page = hasNext ? rows.slice(0, filters.limit) : rows;
  const nextCursor = hasNext
    ? `${page[page.length - 1]!.createdAt.toISOString()}_${page[page.length - 1]!.id}`
    : null;

  // Pull the (small) list of task definitions for the task-filter
  // dropdown. Ordered alphabetically by title so the picker stays
  // predictable across reloads.
  const tasks = await prisma.task.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("super_admin.task_instances.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.task_instances.description")}
        </p>
      </div>
      <AdminInstanceTable
        initialInstances={page.map((row) => ({
          id: row.id,
          taskId: row.taskId,
          userId: row.userId,
          status: row.status,
          source: row.source,
          signature: row.signature,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          completedAt: row.completedAt ? row.completedAt.toISOString() : null,
          assignedByAdminId: row.assignedByAdminId,
          completedByAdminId: row.completedByAdminId,
          user: row.user,
          task: row.task,
        }))}
        initialNextCursor={nextCursor}
        initialFilters={{
          userId: filters.userId ?? "",
          taskId: filters.taskId ?? "",
          status: filters.status ?? "",
        }}
        tasks={tasks}
      />
    </section>
  );
}
