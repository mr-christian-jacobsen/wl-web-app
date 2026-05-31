import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Patches `z` so `.openapi()` is available on every Zod schema. Called once
// at module load; subsequent imports are no-ops.
extendZodWithOpenApi(z);

export { z };

// Single registry shared across every route-definition module. Importing the
// route files (see `./spec.ts`) is what populates it — there's no auto-scan.
export const registry = new OpenAPIRegistry();

// Cookie-based session is the only credential the API uses (Auth.js JWT in a
// secure cookie). Documenting it lets Swagger UI flag which routes need auth;
// for "Try it out" the browser sends the cookie automatically when the docs
// page is loaded on the same origin.
registry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "authjs.session-token",
  description:
    "Auth.js session cookie set by /api/auth/callback/credentials after login. Swagger UI's Try-it-out reuses the browser cookie automatically when /super-admin/api-docs is open in the same origin.",
});

// Shared-secret header authenticating the scheduler tick endpoint
// (`POST /api/super-admin/tasks/tick`). External cron services can't
// carry an Auth.js session cookie, so the endpoint reads
// `X-Tick-Secret` and constant-time-compares against the
// `tasks.tick.secret` SystemSetting. The secret is auto-generated on
// first read and rotatable from /super-admin/system-settings.
registry.registerComponent("securitySchemes", "tickSecret", {
  type: "apiKey",
  in: "header",
  name: "X-Tick-Secret",
  description:
    "Shared secret matched against the `tasks.tick.secret` SystemSetting via constant-time compare. Only accepted on the scheduler tick endpoint; every other admin route uses `sessionCookie`.",
});

export const ErrorResponse = registry.register(
  "ErrorResponse",
  z
    .object({
      error: z.string().openapi({ example: "Invalid input" }),
    })
    .openapi("ErrorResponse"),
);

export const OkResponse = registry.register(
  "OkResponse",
  z
    .object({
      ok: z.literal(true),
    })
    .openapi("OkResponse"),
);

/** 401 + 403 are identical in shape; expose a helper so registrations stay terse. */
export function unauthorizedResponses() {
  return {
    401: {
      description: "Not authenticated.",
      content: { "application/json": { schema: ErrorResponse } },
    },
    403: {
      description: "Authenticated but not a super-admin.",
      content: { "application/json": { schema: ErrorResponse } },
    },
  } as const;
}

export function validationErrorResponse() {
  return {
    400: {
      description: "Request body or params failed validation.",
      content: { "application/json": { schema: ErrorResponse } },
    },
  } as const;
}

export function jsonResponse<T extends z.ZodTypeAny>(
  description: string,
  schema: T,
  status: 200 | 201 = 200,
) {
  return {
    [status]: {
      description,
      content: { "application/json": { schema } },
    },
  } as const;
}

export const TAGS = {
  Auth: "Auth",
  Profile: "Profile",
  PublicSurveys: "Public surveys",
  Usage: "Usage",
  Logging: "Logging",
  Avatar: "Avatar",
  AdminUsers: "Super admin · Users",
  AdminSurveys: "Super admin · Surveys",
  AdminLanguages: "Super admin · Languages",
  AdminTranslations: "Super admin · Translations",
  AdminTemplates: "Super admin · Email templates",
  AdminEmails: "Super admin · Email log",
  AdminErrors: "Super admin · Error log",
  AdminSettings: "Super admin · System settings",
  AdminTasks: "Super admin · Tasks",
  Tasks: "Tasks",
} as const;
