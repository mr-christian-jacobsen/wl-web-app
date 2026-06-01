import { markNotificationsReadSchema } from "@/lib/validators";

import { registry, TAGS, unauthorizedResponses, z } from "../registry";
import { NotificationDTO } from "../schemas";

/**
 * Notifications routes (U11) — the bell's data source.
 *
 * `GET /api/notifications` lists the signed-in user's notifications
 * with the linked TaskInstance + Task title inlined for one-shot
 * rendering. Hard cap of 50 rows; no pagination — the dropdown
 * surface doesn't need more, and the cap keeps the payload bounded.
 *
 * `POST /api/notifications/mark-read` bulk-marks every unread row for
 * the session user. No body, no `userId` — the route is structurally
 * scoped to `session.user.id`, the only authority. Used by the bell
 * (on dropdown open) and the `/tasks` page (on visit) per R16.
 */
export function registerNotificationRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/notifications",
    tags: [TAGS.Notifications],
    summary: "List the signed-in user's notifications (capped at 50)",
    description:
      "Returns `{ notifications: Notification[] }` for `session.user.id`, ordered `createdAt` descending and capped at 50 rows. Each notification includes the linked TaskInstance + parent Task title + predicateKey so the bell dropdown can render labels without a second round-trip. Cross-user enumeration is structurally impossible — there is no `userId` query parameter.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "The user's notifications (latest first).",
        content: {
          "application/json": {
            schema: z.object({ notifications: z.array(NotificationDTO) }),
          },
        },
      },
      401: unauthorizedResponses()[401],
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/notifications/mark-read",
    tags: [TAGS.Notifications],
    summary: "Mark every unread notification for the signed-in user as read",
    description:
      "Bulk mark-read (R16). Fired by the bell when its dropdown opens and by the `/tasks` page on visit. Idempotent — a second call with no new unread rows returns `{ marked: 0 }`. The route is scoped to `session.user.id`; no body fields are accepted, structurally preventing cross-user mutation.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: markNotificationsReadSchema } },
        required: false,
        description:
          "Body must be `{}` or absent. The schema is `.strict()` so a stray `userId` field is rejected at parse time.",
      },
    },
    responses: {
      200: {
        description:
          "Bulk update completed. `marked` is the number of rows actually flipped (0 when there was nothing to do).",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              marked: z.number().int().min(0),
            }),
          },
        },
      },
      401: unauthorizedResponses()[401],
    },
  });
}
