import {
  createCategorySchema,
  createTagSchema,
  replaceSurveyTagsSchema,
  updateCategorySchema,
  updateTagSchema,
} from "@/lib/validators";

import {
  ErrorResponse,
  jsonResponse,
  registry,
  TAGS,
  unauthorizedResponses,
  validationErrorResponse,
  z,
} from "../registry";
import {
  IdParam,
  SurveyIdParam,
  SurveyTagsResponseDTO,
  TagCategoryDTO,
  TagDTO,
  TagListResponseDTO,
} from "../schemas";

/**
 * Query parameter schema for `GET /api/super-admin/tags`. We can't reuse
 * `listTagsQuerySchema` here because its `.superRefine` wraps it in a
 * ZodEffects, which `zod-to-openapi` can't introspect for path-parameter
 * registration. The shape is kept in lockstep manually — the runtime
 * handler still parses with `listTagsQuerySchema` so the cross-field
 * constraint (scope vs categoryId) is enforced.
 */
const ListTagsQueryParams = z.object({
  q: z
    .string()
    .optional()
    .openapi({
      param: { name: "q", in: "query" },
      description: "Substring match on tag name (case-insensitive).",
    }),
  sort: z
    .enum(["name", "usage"])
    .optional()
    .openapi({
      param: { name: "sort", in: "query" },
      description: "Sort key. Defaults to `name`.",
    }),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .openapi({
      param: { name: "order", in: "query" },
      description: "Sort direction. Defaults to `asc`.",
    }),
  page: z
    .coerce
    .number()
    .int()
    .min(1)
    .optional()
    .openapi({
      param: { name: "page", in: "query" },
      description: "1-indexed page number. Defaults to 1.",
    }),
  pageSize: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .openapi({
      param: { name: "pageSize", in: "query" },
      description: "Page size, 1–100. Defaults to 25.",
    }),
  categoryId: z
    .string()
    .optional()
    .openapi({
      param: { name: "categoryId", in: "query" },
      description:
        "Filter to tags in the given category. Mutually exclusive with `scope=uncategorized`.",
    }),
  scope: z
    .enum(["all", "uncategorized"])
    .optional()
    .openapi({
      param: { name: "scope", in: "query" },
      description:
        "`all` (default) lists every tag; `uncategorized` lists only tags with no category memberships.",
    }),
});

export function registerAdminTagRoutes() {
  // ─── Categories ───────────────────────────────────────────────────────

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/categories",
    tags: [TAGS.AdminTags],
    summary: "List tag categories",
    description:
      "Returns every category in alphabetical order with a denormalised `tagCount` derived from `_count` on the assignment table.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Categories with their tag counts.",
        content: {
          "application/json": {
            schema: z.object({ items: z.array(TagCategoryDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/categories",
    tags: [TAGS.AdminTags],
    summary: "Create a tag category",
    description:
      "Names are trimmed and uniqueness is enforced case-insensitively. Duplicate names return 409 with `error: \"duplicate_name\"`.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createCategorySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Category created. `tagCount` is always `0` on create.",
        content: { "application/json": { schema: TagCategoryDTO } },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      409: {
        description: "A category with that name already exists.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/categories/{id}",
    tags: [TAGS.AdminTags],
    summary: "Update a tag category",
    description:
      "Either `name` or `description` may be supplied (or both). Duplicate names map to 409; unknown ids to 404.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: updateCategorySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Category updated.",
        content: { "application/json": { schema: TagCategoryDTO } },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      404: {
        description: "Category not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description: "A category with that name already exists.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/categories/{id}",
    tags: [TAGS.AdminTags],
    summary: "Delete a tag category",
    description:
      "The category row is removed; the FK cascade on `TagCategoryAssignment` drops every membership row automatically. Tags themselves survive — tags with no remaining categories surface under \"Uncategorized\".",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      204: { description: "Category deleted." },
      ...unauthorizedResponses(),
      404: {
        description: "Category not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  // ─── Tags ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/tags",
    tags: [TAGS.AdminTags],
    summary: "List tags (paginated)",
    description:
      "Server-side paginated list. `scope=uncategorized` and `categoryId` are mutually exclusive — combining them returns 400. Response envelope is `{ items, total, page, pageSize }`.",
    security: [{ sessionCookie: [] }],
    request: { query: ListTagsQueryParams },
    responses: {
      200: {
        description: "Page of tags matching the query.",
        content: { "application/json": { schema: TagListResponseDTO } },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/tags",
    tags: [TAGS.AdminTags],
    summary: "Create a tag",
    description:
      "Optional `categoryIds` attach the tag to existing categories in the same transaction. Unknown category IDs map to 400 with `error: \"unknown_category_ids\"`; duplicate tag names map to 409 with `error: \"duplicate_name\"`.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createTagSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Tag created. `usageCount` is always `0` on create.",
        content: { "application/json": { schema: TagDTO } },
      },
      400: {
        description:
          "Validation failed or one of the supplied `categoryIds` does not exist.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      ...unauthorizedResponses(),
      409: {
        description: "A tag with that name already exists.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/tags/{id}",
    tags: [TAGS.AdminTags],
    summary: "Update a tag",
    description:
      "When `categoryIds` is supplied it REPLACES the current set (empty array detaches all categories). Omit `categoryIds` to leave memberships untouched.",
    security: [{ sessionCookie: [] }],
    request: {
      params: IdParam,
      body: {
        content: { "application/json": { schema: updateTagSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Tag updated.",
        content: { "application/json": { schema: TagDTO } },
      },
      400: {
        description:
          "Validation failed or one of the supplied `categoryIds` does not exist.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      ...unauthorizedResponses(),
      404: {
        description: "Tag not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description: "A tag with that name already exists.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/tags/{id}",
    tags: [TAGS.AdminTags],
    summary: "Delete a tag",
    description:
      "Refuses (409) when the tag is currently attached to any survey — the response body carries `surveyCount` so the UI can name the count. Unattached tags delete cleanly; the FK cascade on `TagCategoryAssignment` removes category memberships.",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      204: { description: "Tag deleted." },
      ...unauthorizedResponses(),
      404: {
        description: "Tag not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description:
          "Tag is still attached to one or more surveys. Body: `{ error: \"tag_in_use\", surveyCount }`.",
        content: {
          "application/json": {
            schema: z.object({
              error: z.literal("tag_in_use"),
              surveyCount: z.number().int().min(1),
            }),
          },
        },
      },
    },
  });

  // ─── Survey ↔ Tag attachment ──────────────────────────────────────────

  registry.registerPath({
    method: "get",
    path: "/api/super-admin/surveys/{id}/tags",
    tags: [TAGS.AdminTags],
    summary: "List the tag IDs attached to a survey",
    description:
      "Returns only the tag IDs (not full tag detail) — the editor page resolves names against the picker catalog it already fetches.",
    security: [{ sessionCookie: [] }],
    request: { params: SurveyIdParam },
    responses: {
      ...jsonResponse("Tag IDs currently attached to the survey.", SurveyTagsResponseDTO),
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/super-admin/surveys/{id}/tags",
    tags: [TAGS.AdminTags],
    summary: "Replace the survey's tag set",
    description:
      "Bulk-replaces the attached tags with the supplied set. Empty `tagIds` detaches all tags. Unknown tag IDs return 400 with `error: \"unknown_tag_ids\"` and the offending IDs.",
    security: [{ sessionCookie: [] }],
    request: {
      params: SurveyIdParam,
      body: {
        content: { "application/json": { schema: replaceSurveyTagsSchema } },
        required: true,
      },
    },
    responses: {
      204: { description: "Tag set replaced." },
      400: {
        description:
          "Validation failed or one of the supplied `tagIds` does not exist. Body shape: `{ error: \"unknown_tag_ids\", unknown: string[] }` when caused by unknown IDs.",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              unknown: z.array(z.string()).optional(),
            }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });
}
