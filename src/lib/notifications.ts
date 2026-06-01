/**
 * Notification helpers — the entity (R13), the dispatch flow (R14, R17)
 * and the read-state bulk update (R16). See U3 in
 * `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md`
 * for the full contract.
 *
 * Module is operationally safe — every helper wraps DB writes and the
 * outbound email call in try/catch and logs failures via `logError`.
 * Callers can `void`-fire the dispatcher from a request handler without
 * fear of bubbling errors back to the user.
 */

import { prisma } from "@/lib/db";
import { sendTaskCreatedEmail } from "@/lib/email";
import { logError } from "@/lib/log.server";

/**
 * Shape of a TaskInstance the dispatcher needs in order to fire a
 * `task_created` notification. Kept narrow on purpose so callers can
 * pass either a freshly-created Prisma row or an arbitrary projection
 * that includes the required keys.
 */
export type DispatchableTaskInstance = {
  id: string;
  userId: string;
  taskId: string;
};

/**
 * Write one `task_created` Notification row. Returns the created row.
 *
 * Does NOT deduplicate by `taskInstanceId` — the instance-idempotency
 * boundary lives in `dispatchTaskCreatedFor`. Direct callers that want
 * to bypass dispatch (e.g. tests) get straight-through write semantics.
 *
 * Wrapped in try/catch so a DB hiccup never bubbles out of the
 * fire-and-forget dispatch path. Returns `null` on failure.
 */
export async function createTaskCreatedNotification(
  userId: string,
  taskInstanceId: string,
) {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        type: "task_created",
        taskInstanceId,
        unread: true,
      },
    });
  } catch (err) {
    await logError(err, {
      context: {
        feature: "notifications.create",
        userId,
        taskInstanceId,
        type: "task_created",
      },
      userId,
    });
    return null;
  }
}

/**
 * Fire a `task_created` notification (and matching email when the user
 * is opted in) for one TaskInstance. The single dispatch boundary —
 * every trigger path (signup, manual-assign, backfill, recurring,
 * specific-date) funnels through here so the opt-out check and the
 * concurrency guard live in exactly one place.
 *
 * Instance-idempotent: queries `Notification` for an existing row with
 * the same `taskInstanceId` + `type: 'task_created'` before writing.
 * If one is already present the call short-circuits — prevents the
 * concurrent-tick race surfaced in adversarial review where two
 * scheduler claims both reach dispatch.
 *
 * The opt-out value can be passed in (`opts.taskEmailsOptOut`,
 * preferred when called from a handler that already has the session
 * in scope) or resolved via a User lookup (the scheduler path, no
 * session). When the user can't be resolved the email is skipped and
 * the notification still fires — in-app delivery is the floor per R18.
 *
 * Never throws — failures are logged and swallowed.
 */
export async function dispatchTaskCreatedFor(
  taskInstance: DispatchableTaskInstance,
  opts: { taskEmailsOptOut?: boolean } = {},
): Promise<void> {
  try {
    // 1. Idempotency: bail if a notification already exists for this instance.
    const existing = await prisma.notification.findFirst({
      where: {
        taskInstanceId: taskInstance.id,
        type: "task_created",
      },
      select: { id: true },
    });
    if (existing) return;

    // 2. Resolve opt-out + the data we need to render the email. When the
    //    caller supplied taskEmailsOptOut (session path), skip the User
    //    read entirely if the user has opted out — we still need email +
    //    languageId + task title for the email path, so only query when
    //    we actually intend to send.
    const optedOut = opts.taskEmailsOptOut;

    // 3. Always write the notification first (R14, R18 — in-app cannot be disabled).
    await createTaskCreatedNotification(taskInstance.userId, taskInstance.id);

    // 4. Email side-channel. Resolve the user + task only when needed.
    let willEmail: boolean;
    if (optedOut === true) {
      willEmail = false;
    } else {
      // No session hint — read the row to find out. Falls through to no-
      // email if the user vanished or the column says they opted out.
      if (optedOut === undefined) {
        const user = await prisma.user.findUnique({
          where: { id: taskInstance.userId },
          select: { taskEmailsOptOut: true },
        });
        willEmail = user ? !user.taskEmailsOptOut : false;
      } else {
        willEmail = true;
      }
    }

    if (!willEmail) return;

    // Resolve recipient + task so we can render the email body.
    const [user, task] = await Promise.all([
      prisma.user.findUnique({
        where: { id: taskInstance.userId },
        select: { email: true, languageId: true },
      }),
      prisma.task.findUnique({
        where: { id: taskInstance.taskId },
        select: { title: true, description: true },
      }),
    ]);
    if (!user || !task) return;

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await sendTaskCreatedEmail(
      user.email,
      {
        taskTitle: task.title,
        taskDescription: task.description ?? "",
        taskUrl: `${appUrl}/tasks`,
      },
      { userId: taskInstance.userId, languageId: user.languageId },
    );
  } catch (err) {
    await logError(err, {
      context: {
        feature: "notifications.dispatch",
        taskInstanceId: taskInstance.id,
        userId: taskInstance.userId,
      },
      userId: taskInstance.userId,
    });
  }
}

/**
 * Flip every unread notification belonging to `userId` to `unread: false`.
 * Used by both the bell-dropdown open and the `/tasks` visit per R16.
 * Idempotent: already-read rows are filtered out by the `unread: true`
 * predicate so re-running is a cheap no-op.
 *
 * Returns the number of rows updated.
 *
 * Wrapped in try/catch + logged on failure — callers can fire-and-forget.
 */
export async function markNotificationsReadForUser(
  userId: string,
): Promise<number> {
  try {
    const res = await prisma.notification.updateMany({
      where: { userId, unread: true },
      data: { unread: false },
    });
    return res.count;
  } catch (err) {
    await logError(err, {
      context: { feature: "notifications.mark_read", userId },
      userId,
    });
    return 0;
  }
}
