import {
  changePasswordSchema,
  themePreferenceSchema,
  updateProfileSchema,
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
import { ProfileUserDTO } from "../schemas";

export function registerProfileRoutes() {
  registry.registerPath({
    method: "patch",
    path: "/api/profile",
    tags: [TAGS.Profile],
    summary: "Update name, email, or preferred language",
    description:
      "Email changes don't take effect until the user confirms via the link sent to the new address — the response carries a `pendingEmailChange` block in that case.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: updateProfileSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Profile updated.",
        content: {
          "application/json": {
            schema: z.object({
              user: ProfileUserDTO,
              pendingEmailChange: z
                .object({
                  newEmail: z.string().email(),
                  message: z.string(),
                })
                .nullable(),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      409: {
        description: "Email already in use.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/profile/password",
    tags: [TAGS.Profile],
    summary: "Change the current password",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: changePasswordSchema } },
        required: true,
      },
    },
    responses: {
      ...jsonResponse("Password changed.", OkResponse),
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/profile/theme",
    tags: [TAGS.Profile],
    summary: "Set the user's UI theme preference",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: themePreferenceSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Preference stored.",
        content: {
          "application/json": {
            schema: z.object({
              themePreference: z.enum(["light", "dark"]).nullable(),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/profile/avatar",
    tags: [TAGS.Avatar],
    summary: "Upload a new avatar image",
    description:
      "Multipart form-data with a single `file` field. Accepts JPEG/PNG/WebP up to 2 MB.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.string().openapi({ type: "string", format: "binary" }),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Avatar stored; URL contains a cache-busting version.",
        content: {
          "application/json": {
            schema: z.object({ avatarUrl: z.string() }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/profile/avatar",
    tags: [TAGS.Avatar],
    summary: "Remove the user's avatar",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Avatar cleared.",
        content: {
          "application/json": {
            schema: z.object({ avatarUrl: z.null() }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/avatar/{id}",
    tags: [TAGS.Avatar],
    summary: "Fetch a user's avatar image bytes",
    description:
      "Returns the raw image bytes with `content-type` set to the stored MIME and aggressive immutable caching headers. 404 when the user has no avatar.",
    request: {
      params: z.object({
        id: z.string().openapi({ param: { name: "id", in: "path" } }),
      }),
    },
    responses: {
      200: {
        description: "Image bytes.",
        content: {
          "image/jpeg": { schema: z.string().openapi({ format: "binary" }) },
          "image/png": { schema: z.string().openapi({ format: "binary" }) },
          "image/webp": { schema: z.string().openapi({ format: "binary" }) },
        },
      },
      404: { description: "No avatar found." },
    },
  });
}
