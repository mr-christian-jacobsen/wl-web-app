import { redirect } from "next/navigation";

import { TaskList, type TaskListItem } from "@/components/tasks/TaskList";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markNotificationsReadForUser } from "@/lib/notifications";
import { getPredicate } from "@/lib/predicates";
import { getServerT } from "@/lib/translations.server";

/**
 * `/tasks` — the user-facing task list (R10, R19, R20).
 *
 * Pulls the user's pending + completed TaskInstances ordered by
 * `createdAt DESC` (pending first by status, then date — see the two
 * separate queries below — keeps the SQL simple and avoids a
 * `ORDER BY status ASC, createdAt DESC` that's harder to reason about
 * with a composite index later).
 *
 * Each instance carries its Task title / description / predicate key
 * inlined; we resolve the predicate's `deepLinkPath` on the server so
 * the client component doesn't need to import `KNOWN_PREDICATES`.
 *
 * Per R16, visiting `/tasks` marks every unread notification for the
 * user as read. The helper is fire-and-forget and operationally safe
 * (try/catch + logged), so we don't await it — the page render proceeds
 * immediately. U11 will replace this with a session-aware call from
 * the bell context, but the call site here keeps R16 satisfied for v1
 * even before the bell ships.
 */
export default async function TasksPage() {
  const session = await auth();
  if (!session) redirect("/login?from=/tasks");

  const [pendingRows, completedRows] = await Promise.all([
    prisma.taskInstance.findMany({
      where: { userId: session.user.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        taskId: true,
        createdAt: true,
        completedAt: true,
        task: {
          select: { title: true, description: true, predicateKey: true },
        },
      },
    }),
    prisma.taskInstance.findMany({
      where: { userId: session.user.id, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        taskId: true,
        createdAt: true,
        completedAt: true,
        task: {
          select: { title: true, description: true, predicateKey: true },
        },
      },
    }),
  ]);

  // R16: visiting /tasks clears unread notifications. Fire-and-forget
  // — the helper logs + swallows internal errors so we don't need a
  // try/catch here, and we deliberately don't await so the page renders
  // immediately. The bell badge will reflect the new state on the next
  // request even if this call's write trails the response.
  void markNotificationsReadForUser(session.user.id);

  const toItem = (
    row: (typeof pendingRows)[number] | (typeof completedRows)[number],
  ): TaskListItem => ({
    id: row.id,
    taskId: row.taskId,
    title: row.task.title,
    description: row.task.description ?? null,
    deepLinkPath: row.task.predicateKey
      ? (getPredicate(row.task.predicateKey)?.deepLinkPath ?? null)
      : null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });

  const t = await getServerT();

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("tasks.page.title")}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("tasks.page.subtitle")}
        </p>
      </header>
      <TaskList
        pending={pendingRows.map(toItem)}
        completed={completedRows.map(toItem)}
      />
    </section>
  );
}
