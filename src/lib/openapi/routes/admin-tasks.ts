import {
  assignTaskInstanceSchema,
  createTaskSchema,
  enableTaskSchema,
  tickRequestSchema,
  updateTaskSchema,
} from "@/lib/validators";

import {
  ErrorResponse,
  jsonResponse,
  OkResponse,
  registry,
  TAGS,
  unauthorizedResponses,
  validationErrorResponse,
  z,
} from "../registry";
import { IdParam, TaskDTO, TaskInstanceDTO } from "../schemas";

/**
 * Admin tasks routes — registers the manual-assign endpoint (U4),
 * the backfill-on-enable endpoints (U5), the scheduler tick (U6), and
 * the definition CRUD surface (U7).
 */
export function registerAdminTaskRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/super-admin/tasks",
    tags: [TAGS.AdminTasks],
    summary: "List task definitions",
    description:
      "Returns every task definition with summary counts (instance + trigger) for the admin list page. Ordering: most recently updated first.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Tasks, most recently updated first.",
        content: {
          "application/json": {
            schema: z.object({ tasks: z.array(TaskDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/tasks",
    tags: [TAGS.AdminTasks],
    summary: "Create a task definition",
    description:
      "Creates a Task and its TaskTrigger child rows in one transaction. The validator's `specific_date.dates: string[]` is converted at the handler boundary into the DB column `dateList` (newline-joined). `enabled` defaults to false — admins flip it on through the dedicated `/enable` endpoint so the backfill side effects + cap pre-check fire.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createTaskSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Task created.",
        content: {
          "application/json": {
            schema: z.object({ task: TaskDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/tasks/{id}",
    tags: [TAGS.AdminTasks],
    summary: "Fetch a task definition with its triggers",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      200: {
        description: "Task detail including the trigger list and instance count.",
        content: {
          "application/json": {
            schema: z.object({ task: TaskDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
      404: {
        description: "Task not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/tasks/{id}",
    tags: [TAGS.AdminTasks],
    summary: "Update a task definition (partial)",
    description:
      "Every field is optional. When `triggers` is present the whole trigger list is replaced (delete-all + insert in one transaction). The disabled→enabled transition is NOT supported here — admins route through `/enable` for that path so the backfill fires; PATCH only supports `enabled: false` (disable) or leaving the field untouched.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: updateTaskSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated task with its current trigger list.",
        content: {
          "application/json": {
            schema: z.object({ task: TaskDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Task not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/tasks/{id}",
    tags: [TAGS.AdminTasks],
    summary: "Delete a task definition",
    description:
      "Refuses (409) when the task has any TaskInstance rows — admins must zero those out first. Triggers cascade with the task. Mirrors the language-delete-refuse-on-children pattern.",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      ...jsonResponse("Task deleted.", OkResponse),
      ...unauthorizedResponses(),
      404: {
        description: "Task not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description:
          "Task has TaskInstance rows (`code: 'HAS_INSTANCES'`). Body carries `instanceCount`.",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              code: z.literal("HAS_INSTANCES"),
              instanceCount: z.number().int().min(1),
            }),
          },
        },
      },
    },
  });


  registry.registerPath({
    method: "post",
    path: "/api/super-admin/tasks/{id}/assign",
    tags: [TAGS.AdminTasks],
    summary: "Manually assign a task definition to a user",
    description:
      "Creates one pending TaskInstance for the chosen user; if the task's predicate matches the user's current state the instance is created completed silently with source 'predicate' (no notification). Otherwise the instance stays pending and a task_created notification + email fires (modulo opt-out).",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: assignTaskInstanceSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description:
          "Instance created. `status` distinguishes the pending-with-notification path (AE5) from the silent-completed path (AE5b).",
        content: {
          "application/json": {
            schema: z.object({ instance: TaskInstanceDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Task definition or target user not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description:
          "Tasks scheduler is disabled (`tasks.scheduler.enabled` SystemSetting is false) — manual assign refused.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/tasks/{id}/enable",
    tags: [TAGS.AdminTasks],
    summary: "Enable a task definition and run backfill",
    description:
      "Flips `Task.enabled` from false to true and kicks off a fire-and-forget backfill that creates one TaskInstance per existing user without an open instance. The admin chooses per call whether the backfill notifies (in-app + email per non-matching predicate) or runs silently. Returns 202 immediately; the backfill continues in the background. Returns 409 ALREADY_ENABLED if already enabled, 422 EMAIL_CAP_EXCEEDED when notify=true and eligible target count exceeds `tasks.backfill.maxEmailsPerEnable`.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: enableTaskSchema } },
        required: true,
      },
    },
    responses: {
      202: {
        description:
          "Backfill started — fire-and-forget. `eligible` is the count of users targeted at flip time.",
        content: {
          "application/json": {
            schema: z.object({
              status: z.literal("backfill_started"),
              eligible: z.number().int().min(0),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Task definition not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description:
          "Task is already enabled — clicking Enable twice produces this rather than a duplicate backfill (`code: 'ALREADY_ENABLED'`).",
        content: { "application/json": { schema: ErrorResponse } },
      },
      422: {
        description:
          "Email cap exceeded (`code: 'EMAIL_CAP_EXCEEDED'`). Body carries `eligible`, `cap`, and an `action` hint. Silent backfill is unaffected by this cap.",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              code: z.literal("EMAIL_CAP_EXCEEDED"),
              eligible: z.number().int().min(0),
              cap: z.number().int().min(1),
              action: z.string(),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/tasks/tick",
    tags: [TAGS.AdminTasks],
    summary: "Scheduler tick — sweep due recurring + dated triggers",
    description:
      "External-cron-callable entry point. Auth is the shared-secret header `X-Tick-Secret` matched against the `tasks.tick.secret` SystemSetting via constant-time compare — NOT the session cookie, because cron services can't hold a NextAuth JWT. Internally claims `tasks.tick.lastRunAt` with the `tasks.tick.windowMs` window (default 5 min) so overlapping ticks no-op. On success returns aggregate stats. When the tasks kill switch (`tasks.scheduler.enabled`) is off, returns 200 with `status: 'scheduler_disabled'`.",
    security: [{ tickSecret: [] }],
    request: {
      body: {
        content: { "application/json": { schema: tickRequestSchema } },
        required: false,
        description:
          "Body must be `{}` or absent — the tick takes no client parameters; every knob lives in SystemSetting.",
      },
    },
    responses: {
      200: {
        description:
          "Tick processed. `status: 'ok'` carries the run stats; `status: 'scheduler_disabled'` indicates the kill switch is off (no work done).",
        content: {
          "application/json": {
            schema: z.union([
              z.object({
                status: z.literal("ok"),
                usersProcessed: z.number().int().min(0),
                instancesCreated: z.number().int().min(0),
                notificationsFired: z.number().int().min(0),
              }),
              z.object({ status: z.literal("scheduler_disabled") }),
            ]),
          },
        },
      },
      202: {
        description:
          "Tick skipped because the previous run is still within `tasks.tick.windowMs` ago. Caller can retry after the window elapses.",
        content: {
          "application/json": {
            schema: z.object({
              status: z.literal("tick_skipped"),
              reason: z.literal("window_active"),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      401: {
        description:
          "Missing or wrong `X-Tick-Secret` header (`code: 'INVALID_TICK_SECRET'`).",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/tasks/{id}/enable/count",
    tags: [TAGS.AdminTasks],
    summary: "Count users that would receive an instance on enable",
    description:
      "Returns the number of users without an open pending TaskInstance for this task — the same population `runBackfillForDefinition` would target. Used by the BackfillDialog to render 'N users will get an instance' before the admin confirms.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
    },
    responses: {
      200: {
        description: "The eligible user count.",
        content: {
          "application/json": {
            schema: z.object({ count: z.number().int().min(0) }),
          },
        },
      },
      ...unauthorizedResponses(),
      404: {
        description: "Task definition not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
