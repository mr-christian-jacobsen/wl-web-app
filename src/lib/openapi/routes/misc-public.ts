import { clientLogEntrySchema, submitResponseSchema } from "@/lib/validators";

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

export function registerMiscPublicRoutes() {
  registry.registerPath({
    method: "post",
    path: "/api/log",
    tags: [TAGS.Logging],
    summary: "Forward a client-side log entry",
    description:
      "Used by the in-browser error reporter. Anonymous calls are accepted; if a session cookie is present the entry is associated with the user. Payload capped at 64 KB.",
    request: {
      body: {
        content: { "application/json": { schema: clientLogEntrySchema } },
        required: true,
      },
    },
    responses: {
      ...jsonResponse("Entry queued.", OkResponse),
      ...validationErrorResponse(),
      413: {
        description: "Payload exceeds 64 KB.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/usage/heartbeat",
    tags: [TAGS.Usage],
    summary: "Record a viewport/usage ping for the signed-in user",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                screenWidth: z.number().int().positive().max(20_000).optional(),
                screenHeight: z.number().int().positive().max(20_000).optional(),
                viewportWidth: z.number().int().positive().max(20_000).optional(),
                viewportHeight: z.number().int().positive().max(20_000).optional(),
                timezone: z.string().max(64).optional(),
                language: z.string().max(32).optional(),
              })
              .strict(),
          },
        },
        required: true,
      },
    },
    responses: {
      ...jsonResponse("Heartbeat recorded.", OkResponse),
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/surveys/{slug}/responses",
    tags: [TAGS.PublicSurveys],
    summary: "Submit a survey response",
    description:
      "Unauthenticated. Looks the survey up by its 6-character `publicSlug` and rejects unpublished surveys with 404 so IDs aren't enumerable. The submitter IP is stored as a truncated SHA-256 hash.",
    request: {
      params: z.object({
        slug: z.string().openapi({ param: { name: "slug", in: "path" } }),
      }),
      body: {
        content: { "application/json": { schema: submitResponseSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Response stored; returns the new row id.",
        content: {
          "application/json": {
            schema: z.object({ id: z.string() }),
          },
        },
      },
      ...validationErrorResponse(),
      404: {
        description: "Unknown or unpublished survey.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
