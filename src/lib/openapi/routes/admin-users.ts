import { adminCreateUserSchema, adminUpdateUserSchema } from "@/lib/validators";

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
import { IdParam, UserDTO } from "../schemas";

export function registerAdminUserRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/super-admin/users",
    tags: [TAGS.AdminUsers],
    summary: "List all users",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "User list.",
        content: {
          "application/json": {
            schema: z.object({ users: z.array(UserDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/users",
    tags: [TAGS.AdminUsers],
    summary: "Create a user and send an invitation email",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: adminCreateUserSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "User created.",
        content: {
          "application/json": {
            schema: z.object({ user: UserDTO }),
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
    method: "patch",
    path: "/api/super-admin/users/{id}",
    tags: [TAGS.AdminUsers],
    summary: "Update a user's details",
    description:
      "Refuses to revoke the caller's own super-admin status, and refuses to revoke the last super-admin so the system can never lock itself out.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: adminUpdateUserSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated user.",
        content: {
          "application/json": {
            schema: z.object({ user: UserDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "User not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description: "Email already in use.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/users/{id}",
    tags: [TAGS.AdminUsers],
    summary: "Delete a user",
    description:
      "Refuses to delete the caller's own account, or the last super-admin.",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      ...jsonResponse("User deleted.", OkResponse),
      400: {
        description: "Refused (self-delete or last super-admin).",
        content: { "application/json": { schema: ErrorResponse } },
      },
      ...unauthorizedResponses(),
      404: {
        description: "User not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
