import {
  autoTranslateRequestSchema,
  createLanguageSchema,
  updateTranslationSchema,
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
  AutoTranslateItemDTO,
  IdParam,
  LanguageDTO,
  SyncTranslationsResultDTO,
  TranslationDTO,
} from "../schemas";

export function registerAdminLanguageRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/super-admin/languages",
    tags: [TAGS.AdminLanguages],
    summary: "List configured languages",
    description:
      "The default language row is upserted on every call, so a fresh DB always returns at least `GB-en`.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Languages, default-first.",
        content: {
          "application/json": {
            schema: z.object({ languages: z.array(LanguageDTO) }),
          },
        },
      },
      ...unauthorizedResponses(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/languages",
    tags: [TAGS.AdminLanguages],
    summary: "Add a country/language pair",
    description:
      "Pairs are validated against the curated dataset in `src/lib/locales.ts`. Country codes are upper-cased and language codes lower-cased.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: createLanguageSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "Language row created.",
        content: {
          "application/json": {
            schema: z.object({ language: LanguageDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      409: {
        description: "That pair already exists.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/super-admin/languages/{id}",
    tags: [TAGS.AdminLanguages],
    summary: "Delete a language",
    description:
      "Refuses to delete the default row or any row still referenced by an email template.",
    security: [{ sessionCookie: [] }],
    request: { params: IdParam },
    responses: {
      ...jsonResponse("Language deleted.", OkResponse),
      400: {
        description: "Tried to delete the default language.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      ...unauthorizedResponses(),
      404: {
        description: "Language not found.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description: "Language still has email templates attached.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/super-admin/translations",
    tags: [TAGS.AdminTranslations],
    summary: "Upsert a translation value",
    description:
      "An empty string is allowed — it makes lookups fall back to the default language for that key without explicitly deleting the row.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: updateTranslationSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Translation upserted.",
        content: {
          "application/json": {
            schema: z.object({ translation: TranslationDTO }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      500: {
        description: "Persisting the row failed.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/translations/auto-translate",
    tags: [TAGS.AdminTranslations],
    summary: "Auto-translate one or more keys via the configured provider",
    description:
      "When `commit: true` the suggestions are written with `source = \"auto\"`; otherwise they're just returned for review.",
    security: [{ sessionCookie: [] }],
    request: {
      body: {
        content: { "application/json": { schema: autoTranslateRequestSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description:
          "Translations produced by the provider. `provider`/`model` are null when no keys matched.",
        content: {
          "application/json": {
            schema: z.object({
              provider: z.string().nullable(),
              model: z.string().nullable(),
              items: z.array(AutoTranslateItemDTO),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      ...unauthorizedResponses(),
      500: {
        description: "Provider call failed.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/super-admin/translations/sync",
    tags: [TAGS.AdminTranslations],
    summary: "Reflect the in-code translation registry into the database",
    description:
      "Adds any TranslationKey rows and default-language values that are present in `KNOWN_TRANSLATIONS` but missing from the DB. Safe to call repeatedly.",
    security: [{ sessionCookie: [] }],
    responses: {
      200: {
        description: "Sync result with counts.",
        content: { "application/json": { schema: SyncTranslationsResultDTO } },
      },
      ...unauthorizedResponses(),
      500: {
        description: "Sync failed.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });
}
