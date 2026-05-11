import {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
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
import { EmailLogEntryDTO, EmailTemplateDTO, IdParam } from "../schemas";

export function registerAdminTemplateRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/super-admin/email-templates",
    tags: [TAGS.AdminTemplates],
    summary: "List every email template",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Templates, ordered by most recently updated.",
        content: {
          "application/json": {
            schema: z.object({ templates: z.array(EmailTemplateDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/email-templates",
    tags: [TAGS.AdminTemplates],
    summary: "Create a template for a specific language",
    description:
      "`(key, languageId)` is unique — duplicates return 409. The language must already exist.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createEmailTemplateSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Template created.",
        content: {
          "application/json": {
            schema: z.object({ template: EmailTemplateDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      409: {
        description: "Template already exists for that key/language pair.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/email-templates/{id}",
    tags: [TAGS.AdminTemplates],
    summary: "Update a template's copy",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: updateEmailTemplateSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated template.",
        content: {
          "application/json": {
            schema: z.object({ template: EmailTemplateDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Template not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/email-templates/{id}",
    tags: [TAGS.AdminTemplates],
    summary: "Delete a template",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      ...jsonResponse("Template deleted.", OkResponse),
      ...unauthorizedResponses(),
      404: {
        description: "Template not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/emails/{id}/resend",
    tags: [TAGS.AdminEmails],
    summary: "Resend a previously-sent email",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      200: {
        description: "Email re-queued; returns the updated send status.",
        content: {
          "application/json": {
            schema: z.object({ email: EmailLogEntryDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
      404: {
        description: "Email log row not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
