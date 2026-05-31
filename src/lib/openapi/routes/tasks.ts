import {
  ErrorResponse,
  registry,
  TAGS,
  unauthorizedResponses,
  z,
} from "../registry";
import { IdParam, TaskInstanceDTO } from "../schemas";

/**
 * User-facing tasks routes — the `/api/tasks` GET (list the signed-in
 * user's instances grouped by status) and `/api/tasks/{id}/complete`
 * POST (R10 — user marks own pending instance complete). Lands in U9
 * alongside the dashboard layout and `/tasks` page.
 *
 * Both endpoints use the session cookie; `userId` is never accepted as
 * a request parameter — the session is the only authority and the IDOR
 * boundary on `/complete` returns 404 for instances belonging to other
 * users (so the endpoint can't be used to probe ids).
 */
export function registerTaskRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/tasks",
    tags: [TAGS.Tasks],
    summary: "List the signed-in user's task instances grouped by status",
    description:
      "Returns `{ pending: TaskInstance[], completed: TaskInstance[] }` for `session.user.id`, each instance enriched with the parent Task's title / description / predicateKey. Both arrays are ordered by `createdAt` descending. Cross-user enumeration is structurally impossible — there is no `userId` query parameter.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "User's task instances, grouped by status.",
        content: {
          "application/json": {
            schema: z.object({
              pending: z.array(TaskInstanceDTO),
              completed: z.array(TaskInstanceDTO),
            }),
          },
        },
      },
      401: {
        description: "Not authenticated.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/tasks/{id}/complete",
    tags: [TAGS.Tasks],
    summary: "Mark one of the signed-in user's pending instances complete",
    description:
      "User-initiated complete (R10). Flips `status` to `completed` with `source: 'user'` and stamps `completedAt`. Returns 404 (not 403) when the instance belongs to another user — the IDOR boundary intentionally hides existence. 409 when the instance is already completed.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
    },
    responses: {
      200: {
        description: "Instance flipped to completed with source 'user'.",
        content: {
          "application/json": {
            schema: z.object({ instance: TaskInstanceDTO }),
          },
        },
      },
      401: {
        description: "Not authenticated.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      404: {
        description:
          "Instance not found OR belongs to a different user (IDOR boundary — the response is identical for both cases).",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description:
          "Instance is already completed — clients may treat this as a benign race when they double-clicked the button.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
