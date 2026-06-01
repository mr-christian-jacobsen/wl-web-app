import { registry, z } from "./registry";

// ---------------------------------------------------------------------------
// Domain DTOs. These mirror what each route's `select`/`include` actually
// returns — they're not Prisma types because the wire shape is what callers
// see. Keep them in lockstep with the route handlers if you change a select.
// ---------------------------------------------------------------------------

export const UserDTO = registry.register(
  "User",
  z
    .object({
      id: z.string().openapi({ example: "ckxa5h0a40000abcd" }),
      email: z.string().email().openapi({ example: "user@example.com" }),
      name: z.string().openapi({ example: "Jane Doe" }),
      isSuperAdmin: z.boolean(),
      languageId: z.string().nullable(),
      createdAt: z.string().datetime(),
    })
    .openapi("User"),
);

export const ProfileUserDTO = registry.register(
  "ProfileUser",
  z
    .object({
      id: z.string(),
      email: z.string().email(),
      name: z.string(),
      languageId: z.string().nullable(),
      taskEmailsOptOut: z.boolean(),
    })
    .openapi("ProfileUser"),
);

export const LanguageDTO = registry.register(
  "Language",
  z
    .object({
      id: z.string(),
      countryCode: z.string().openapi({ example: "GB" }),
      languageCode: z.string().openapi({ example: "en" }),
      isDefault: z.boolean(),
      createdAt: z.string().datetime(),
    })
    .openapi("Language"),
);

export const EmailTemplateDTO = registry.register(
  "EmailTemplate",
  z
    .object({
      id: z.string(),
      key: z.string().openapi({ example: "password_reset" }),
      languageId: z.string(),
      name: z.string(),
      subject: z.string(),
      bodyText: z.string(),
      bodyHtml: z.string().nullable(),
      description: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .openapi("EmailTemplate"),
);

export const SurveyStepDTO = registry.register(
  "SurveyStep",
  z
    .object({
      id: z.string(),
      position: z.number().int().min(0),
      type: z.string().openapi({ example: "rating" }),
      title: z.string(),
      notes: z.string().nullable(),
      options: z.string().nullable().openapi({
        description: "Newline-separated options for choice-style steps; null otherwise.",
      }),
    })
    .openapi("SurveyStep"),
);

export const SurveySummaryDTO = registry.register(
  "SurveySummary",
  z
    .object({
      id: z.string(),
      publicSlug: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      published: z.boolean(),
      publishedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      stepCount: z.number().int().min(0),
    })
    .openapi("SurveySummary"),
);

export const SurveyDetailDTO = registry.register(
  "SurveyDetail",
  z
    .object({
      id: z.string(),
      publicSlug: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      published: z.boolean(),
      publishedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      steps: z.array(SurveyStepDTO),
    })
    .openapi("SurveyDetail"),
);

export const LogEntryDTO = registry.register(
  "LogEntry",
  z
    .object({
      id: z.string(),
      level: z.enum(["error", "warning", "info"]),
      source: z.string(),
      name: z.string().nullable(),
      message: z.string(),
      stack: z.string().nullable(),
      url: z.string().nullable(),
      userAgent: z.string().nullable(),
      occurrenceCount: z.number().int().min(1),
      firstOccurredAt: z.string().datetime(),
      lastOccurredAt: z.string().datetime(),
      user: z
        .object({ id: z.string(), email: z.string().email() })
        .nullable(),
    })
    .openapi("LogEntry"),
);

export const SmtpSettingsDTO = registry.register(
  "SmtpSettings",
  z
    .object({
      host: z.string().nullable(),
      port: z.number().int().nullable(),
      user: z.string().nullable(),
      from: z.string().nullable(),
      hasPassword: z.boolean(),
    })
    .openapi("SmtpSettings"),
);

export const TranslateSettingsDTO = registry.register(
  "TranslateSettings",
  z
    .object({
      provider: z.enum(["anthropic", "openai", "deepl"]),
      anthropicModel: z.string().nullable(),
      openaiModel: z.string().nullable(),
      hasAnthropicApiKey: z.boolean(),
      hasOpenaiApiKey: z.boolean(),
      hasDeeplApiKey: z.boolean(),
    })
    .openapi("TranslateSettings"),
);

export const LogRetentionDTO = registry.register(
  "LogRetention",
  z
    .object({
      errorDays: z.number().int().min(0),
      warningDays: z.number().int().min(0),
      infoDays: z.number().int().min(0),
    })
    .openapi("LogRetention"),
);

export const PruneResultDTO = registry.register(
  "PruneResult",
  z
    .object({
      removed: z.number().int().min(0),
      cutoffByLevel: z.record(z.string()),
    })
    .openapi("PruneResult"),
);

export const TranslationDTO = registry.register(
  "Translation",
  z
    .object({
      id: z.string(),
      translationKeyId: z.string(),
      languageId: z.string(),
      value: z.string(),
      source: z.string().openapi({ example: "manual" }),
      updatedAt: z.string().datetime(),
    })
    .openapi("Translation"),
);

export const AutoTranslateItemDTO = registry.register(
  "AutoTranslateItem",
  z
    .object({
      keyId: z.string(),
      key: z.string(),
      translation: z.string(),
    })
    .openapi("AutoTranslateItem"),
);

export const EmailLogEntryDTO = registry.register(
  "EmailLogEntry",
  z
    .object({
      id: z.string(),
      status: z.string(),
      error: z.string().nullable(),
      sentAt: z.string().datetime(),
      sentAtDisplay: z.string(),
    })
    .openapi("EmailLogEntry"),
);

export const TestEmailOutcomeDTO = registry.register(
  "TestEmailOutcome",
  z
    .object({
      ok: z.boolean(),
      error: z.string().nullable().optional(),
    })
    .openapi("TestEmailOutcome"),
);

export const SyncTranslationsResultDTO = registry.register(
  "SyncTranslationsResult",
  z
    .object({
      added: z.number().int().min(0),
      updated: z.number().int().min(0),
      skipped: z.number().int().min(0),
    })
    .openapi("SyncTranslationsResult"),
);

export const TagCategoryDTO = registry.register(
  "TagCategory",
  z
    .object({
      id: z.string(),
      name: z.string().openapi({ example: "Audience" }),
      description: z.string().nullable(),
      createdAt: z.string().datetime(),
      tagCount: z.number().int().min(0),
    })
    .openapi("TagCategory"),
);

export const TagDTO = registry.register(
  "Tag",
  z
    .object({
      id: z.string(),
      name: z.string().openapi({ example: "Compliance" }),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      categories: z.array(
        z.object({ id: z.string(), name: z.string() }),
      ),
      usageCount: z
        .number()
        .int()
        .min(0)
        .openapi({
          description: "Number of surveys this tag is currently attached to.",
        }),
    })
    .openapi("Tag"),
);

export const TagListResponseDTO = registry.register(
  "TagListResponse",
  z
    .object({
      items: z.array(TagDTO),
      total: z.number().int().min(0),
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1),
    })
    .openapi("TagListResponse"),
);

export const SurveyTagsResponseDTO = registry.register(
  "SurveyTagsResponse",
  z
    .object({
      tagIds: z.array(z.string()),
    })
    .openapi("SurveyTagsResponse"),
);

/**
 * One trigger row attached to a Task definition (U7). The DB column
 * `dateList` is newline-joined `YYYY-MM-DD`; the editor and the
 * `(create|update)TaskSchema` validators carry it as an array on the
 * wire, but the read-side shape (returned by `GET` on the editor) is
 * still the storage shape because the editor splits on '\n' itself.
 */
export const TaskTriggerDTO = registry.register(
  "TaskTrigger",
  z
    .object({
      id: z.string(),
      kind: z.enum(["signup", "manual_assign", "recurring", "specific_date"]),
      intervalDays: z.number().int().min(1).nullable(),
      dateList: z
        .string()
        .nullable()
        .openapi({
          description:
            "Newline-joined YYYY-MM-DD strings for specific_date triggers; null for every other kind.",
        }),
    })
    .openapi("TaskTrigger"),
);

/**
 * Admin task definition summary returned by `GET
 * /api/super-admin/tasks` (the list) and the POST/PATCH/GET
 * single-task endpoints (the detail variant additionally inlines the
 * trigger list).
 */
export const TaskDTO = registry.register(
  "Task",
  z
    .object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      predicateKey: z
        .string()
        .nullable()
        .openapi({
          description:
            "One of `KNOWN_PREDICATES` keys from `src/lib/predicates.ts`, or null for the 'manual / trust user' sentinel.",
        }),
      enabled: z.boolean(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      instanceCount: z.number().int().min(0).openapi({
        description:
          "Count of TaskInstance rows referencing this task. Used by the admin list + delete-refuse check.",
      }),
      triggerCount: z.number().int().min(0).optional().openapi({
        description:
          "Count of TaskTrigger rows. Only present on list responses; the detail GET includes the full `triggers` array instead.",
      }),
      triggers: z.array(TaskTriggerDTO).optional().openapi({
        description:
          "Inlined trigger list. Present on detail GET / POST / PATCH responses; absent from list summaries.",
      }),
    })
    .openapi("Task"),
);

/**
 * Per-user task instance returned by the admin assign endpoint (and
 * later by the user list / admin overview endpoints in U8/U9). The
 * shape matches the Prisma row directly because the assign endpoint
 * returns `manuallyAssignInstance`'s output verbatim.
 */
export const TaskInstanceDTO = registry.register(
  "TaskInstance",
  z
    .object({
      id: z.string(),
      taskId: z.string(),
      userId: z.string(),
      status: z.enum(["pending", "completed"]).openapi({ example: "pending" }),
      source: z
        .enum(["predicate", "user", "admin"])
        .nullable()
        .openapi({
          description:
            "Provenance of the completed status. Null while the instance is still pending.",
        }),
      signature: z.string().openapi({
        description:
          'Uniqueness key per KTD10 — e.g. "signup", "manual:<iso>", "backfill:<iso>", "recurring:<iso>", "specific-date:<YYYY-MM-DD>".',
      }),
      completedAt: z.string().datetime().nullable(),
      assignedByAdminId: z.string().nullable(),
      completedByAdminId: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .openapi("TaskInstance"),
);

/**
 * Per-user task instance with the joined User + Task fields the admin
 * global instance overview table needs to render (U8 — R23, R24).
 * Mirrors the `select` shape in `GET /api/super-admin/tasks/instances`
 * exactly so the wire format and the DTO stay in lockstep.
 *
 * Returned shape uses ISO strings for the date fields (the handler
 * `.toISOString()`s them on the way out) so downstream consumers
 * (Swagger UI, generated clients) get a predictable string type.
 */
export const TaskInstanceWithUserAndTaskDTO = registry.register(
  "TaskInstanceWithUserAndTask",
  z
    .object({
      id: z.string(),
      taskId: z.string(),
      userId: z.string(),
      status: z.enum(["pending", "completed"]),
      source: z.enum(["predicate", "user", "admin"]).nullable(),
      signature: z.string(),
      completedAt: z.string().datetime().nullable(),
      assignedByAdminId: z.string().nullable(),
      completedByAdminId: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      user: z.object({
        id: z.string(),
        email: z.string().email(),
        name: z.string(),
      }),
      task: z.object({
        id: z.string(),
        title: z.string(),
      }),
    })
    .openapi("TaskInstanceWithUserAndTask"),
);

/**
 * In-app notification (R13) returned by `GET /api/notifications`. The
 * dropdown surface needs the linked `TaskInstance` + its parent `Task`
 * title so the row can render a label and an "open task" link without
 * a second request — the include is therefore part of the DTO, not
 * fetched separately.
 *
 * `taskInstanceId` is nullable to mirror the schema (the FK is
 * `onDelete: SetNull`, so a notification can outlive its instance and
 * still appear in the dropdown after the row has been pruned).
 */
export const NotificationDTO = registry.register(
  "Notification",
  z
    .object({
      id: z.string(),
      userId: z.string(),
      type: z.string().openapi({
        description:
          "Notification type discriminator. v1 only emits `task_created`; the field exists to leave room for future types without a schema migration.",
        example: "task_created",
      }),
      taskInstanceId: z.string().nullable(),
      unread: z.boolean(),
      createdAt: z.string().datetime(),
      taskInstance: z
        .object({
          id: z.string(),
          status: z.enum(["pending", "completed"]),
          task: z.object({
            id: z.string(),
            title: z.string(),
            predicateKey: z.string().nullable(),
          }),
        })
        .nullable()
        .openapi({
          description:
            "Inlined parent TaskInstance + Task so the dropdown can render the title and link to the task without a second round-trip. Null when the instance has been deleted (the FK is onDelete: SetNull).",
        }),
    })
    .openapi("Notification"),
);

// ---------------------------------------------------------------------------
// Inline request schemas — these don't live in `validators.ts` because they
// only describe URL/header shapes for the OpenAPI document, not body parsing.
// ---------------------------------------------------------------------------

export const IdParam = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});

export const SurveyIdParam = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});

export const StepIdParam = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
  stepId: z.string().min(1).openapi({ param: { name: "stepId", in: "path" } }),
});

export const SurveySlugParam = z.object({
  slug: z.string().min(1).openapi({ param: { name: "slug", in: "path" } }),
});
