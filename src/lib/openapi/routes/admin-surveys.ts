import {
  createStepSchema,
  createSurveySchema,
  reorderStepsSchema,
  setPublishedSchema,
  updateStepSchema,
  updateSurveySchema,
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
  StepIdParam,
  SurveyDetailDTO,
  SurveyStepDTO,
  SurveySummaryDTO,
} from "../schemas";

export function registerAdminSurveyRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/super-admin/surveys",
    tags: [TAGS.AdminSurveys],
    summary: "List surveys with step counts",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Surveys, most recently updated first.",
        content: {
          "application/json": {
            schema: z.object({ surveys: z.array(SurveySummaryDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/surveys",
    tags: [TAGS.AdminSurveys],
    summary: "Create a draft survey",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createSurveySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Survey created with a fresh public slug.",
        content: {
          "application/json": {
            schema: z.object({ survey: SurveySummaryDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/surveys/{id}",
    tags: [TAGS.AdminSurveys],
    summary: "Fetch a survey with all its steps",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      200: {
        description: "Survey detail.",
        content: {
          "application/json": {
            schema: z.object({ survey: SurveyDetailDTO }),
          },
        },
      },
      ...unauthorizedResponses(),
      404: {
        description: "Survey not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/surveys/{id}",
    tags: [TAGS.AdminSurveys],
    summary: "Rename or change the description of a survey",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: updateSurveySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated survey summary.",
        content: {
          "application/json": {
            schema: z.object({
              survey: SurveyDetailDTO.omit({ steps: true }),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Survey not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/surveys/{id}",
    tags: [TAGS.AdminSurveys],
    summary: "Delete a survey and all its steps + responses",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      ...jsonResponse("Survey deleted.", OkResponse),
      ...unauthorizedResponses(),
      404: {
        description: "Survey not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/surveys/{id}/publish",
    tags: [TAGS.AdminSurveys],
    summary: "Toggle a survey's published flag",
    description:
      "Publishing is refused if the survey has zero steps or any choice step has fewer than two options. `publishedAt` is set the first time a survey goes live and never cleared.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: setPublishedSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated survey.",
        content: {
          "application/json": {
            schema: z.object({
              survey: SurveyDetailDTO.omit({ steps: true }),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Survey not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/surveys/{id}/steps",
    tags: [TAGS.AdminSurveys],
    summary: "Append a new step to a survey",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: createStepSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Step created at the end of the survey.",
        content: {
          "application/json": {
            schema: z.object({ step: SurveyStepDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Survey not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/surveys/{id}/steps/{stepId}",
    tags: [TAGS.AdminSurveys],
    summary: "Update a single step's fields",
    security: [{ sessionCookie: [] }],
    request: {
      params: StepIdParam,
      body: {
        content: { "application/json": { schema: updateStepSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Updated step.",
        content: {
          "application/json": {
            schema: z.object({ step: SurveyStepDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Step not found in that survey.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/surveys/{id}/steps/{stepId}",
    tags: [TAGS.AdminSurveys],
    summary: "Remove a step and re-tighten positions",
    security: [{ sessionCookie: [] }],
    request: { params: StepIdParam },
    responses: {
      ...jsonResponse("Step removed.", OkResponse),
      ...unauthorizedResponses(),
      404: {
        description: "Step not found in that survey.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/surveys/{id}/steps/reorder",
    tags: [TAGS.AdminSurveys],
    summary: "Replace the survey's step ordering",
    description:
      "`stepIds` must list every step in the survey exactly once. Positions are rewritten to match the array order in a single transaction.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: reorderStepsSchema } },
        required: true,
      },
    },
    responses: {
      ...jsonResponse("Positions updated.", OkResponse),
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Survey not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
