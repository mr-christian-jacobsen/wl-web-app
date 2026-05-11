import {
  testEmailSchema,
  updateLogRetentionSchema,
  updateSmtpSettingsSchema,
  updateTranslateSettingsSchema,
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
import {
  IdParam,
  LogEntryDTO,
  LogRetentionDTO,
  PruneResultDTO,
  SmtpSettingsDTO,
  TestEmailOutcomeDTO,
  TranslateSettingsDTO,
} from "../schemas";

export function registerAdminSettingsRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/super-admin/errors",
    tags: [TAGS.AdminErrors],
    summary: "List the 200 most recent log entries",
    description:
      "Supports `level` (`error|warning|info`) and `source` filters via query string. Unknown values are silently ignored.",
    security: [{ sessionCookie: [] }],
    request: {
      query: z.object({
        level: z.enum(["error", "warning", "info"]).optional(),
        source: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Recent log entries.",
        content: {
          "application/json": {
            schema: z.object({ entries: z.array(LogEntryDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/errors/{id}",
    tags: [TAGS.AdminErrors],
    summary: "Delete a single log entry",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      ...jsonResponse("Entry removed.", OkResponse),
      ...unauthorizedResponses(),
      404: {
        description: "Log entry not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/system-settings/smtp",
    tags: [TAGS.AdminSettings],
    summary: "Get the current SMTP configuration",
    description: "The password itself is never returned — only `hasPassword`.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "SMTP settings.",
        content: {
          "application/json": {
            schema: z.object({ settings: SmtpSettingsDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/system-settings/smtp",
    tags: [TAGS.AdminSettings],
    summary: "Update SMTP configuration",
    description:
      "Send `pass: \"\"` to leave the stored password untouched, `null` to clear it, or any string to overwrite.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: updateSmtpSettingsSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated SMTP settings.",
        content: {
          "application/json": {
            schema: z.object({ settings: SmtpSettingsDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/system-settings/smtp/test",
    tags: [TAGS.AdminSettings],
    summary: "Send a test email through the configured SMTP server",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: testEmailSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Outcome with `ok` flag plus an optional error message.",
        content: {
          "application/json": {
            schema: z.object({ outcome: TestEmailOutcomeDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/system-settings/translate-provider",
    tags: [TAGS.AdminSettings],
    summary: "Get the translation provider config (no secrets)",
    description: "API keys are never returned; only `has…ApiKey` booleans.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Translation provider settings.",
        content: {
          "application/json": {
            schema: z.object({ settings: TranslateSettingsDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/system-settings/translate-provider",
    tags: [TAGS.AdminSettings],
    summary: "Update the translation provider config",
    description:
      "API keys use the same convention as SMTP — `\"\"` leaves the stored value untouched, `null` clears it.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: updateTranslateSettingsSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated provider settings.",
        content: {
          "application/json": {
            schema: z.object({ settings: TranslateSettingsDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      500: {
        description: "Persisting the change failed.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/system-settings/log-retention",
    tags: [TAGS.AdminSettings],
    summary: "Get the per-level log-retention windows (in days)",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Current retention settings.",
        content: {
          "application/json": {
            schema: z.object({ retention: LogRetentionDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/system-settings/log-retention",
    tags: [TAGS.AdminSettings],
    summary: "Update the log-retention windows",
    description: "A value of `0` for a level disables pruning for that level.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: updateLogRetentionSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated retention settings.",
        content: {
          "application/json": {
            schema: z.object({ retention: LogRetentionDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/system-settings/log-retention/prune",
    tags: [TAGS.AdminSettings],
    summary: "Run the log pruner immediately",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Prune result.",
        content: {
          "application/json": {
            schema: z.object({ result: PruneResultDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });
}
