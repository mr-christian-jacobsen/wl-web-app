import { assignTaskInstanceSchema } from "@/lib/validators";

import {
  ErrorResponse,
  registry,
  TAGS,
  unauthorizedResponses,
  validationErrorResponse,
  z,
} from "../registry";
import { IdParam, TaskInstanceDTO } from "../schemas";

/**
 * Admin tasks routes — v1 only registers the manual-assign endpoint
 * shipped in U4. The full CRUD surface (list / create / update / delete
 * / enable / tick) lands in U7–U10 and will add its own registrations
 * to this file.
 */
export function registerAdminTaskRoutes() {
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
}
