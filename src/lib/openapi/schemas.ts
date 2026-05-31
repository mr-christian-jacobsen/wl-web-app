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
