import { z } from "zod";

import { isValidCountryLanguage } from "@/lib/locales";
import { KNOWN_PREDICATE_KEYS } from "@/lib/predicates";
import { STEP_TYPE_KEYS, parseOptions, stepTypeRequiresOptions } from "@/lib/step-types";

export const emailSchema = z.string().trim().toLowerCase().email("Invalid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be at most 80 characters");

export const signupSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(32),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailSchema });
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * `languageId` accepts:
 *   - a non-empty string → set the user's preferred language
 *   - `null` → clear the preference (use the system default)
 *   - `undefined` (i.e. omitted) → leave the column untouched
 *
 * The route handler tells these three apart with `'languageId' in data`
 * + `data.languageId` value. Server validates that the id exists in the
 * Language table.
 */
export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    languageId: z
      .union([z.string().trim().min(1), z.null()])
      .optional(),
    /**
     * Opt-out toggle for `task_created` notification emails. In-app
     * notifications cannot be disabled — only the email side-channel.
     * Defaults to `false` (emails enabled) on the User row, per KTD5.
     */
    taskEmailsOptOut: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.email !== undefined ||
      d.languageId !== undefined ||
      d.taskEmailsOptOut !== undefined,
    {
      message: "Provide at least one field to update",
    },
  );
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const adminCreateUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  isSuperAdmin: z.boolean().optional().default(false),
  /**
   * Optional preferred language. Same `string | null | undefined` shape
   * as `updateProfileSchema.languageId` — null/undefined both mean
   * "leave unset" at create time, which makes the user follow the
   * system default. The route validates the id exists in the DB.
   */
  languageId: z.union([z.string().trim().min(1), z.null()]).optional(),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    isSuperAdmin: z.boolean().optional(),
    languageId: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Provide at least one field to update",
  });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const templateKeySchema = z
  .string()
  .trim()
  .min(2, "Key must be at least 2 characters")
  .max(64, "Key must be at most 64 characters")
  .regex(/^[a-z0-9_]+$/, "Key may only contain lowercase letters, digits, and underscores");

export const createEmailTemplateSchema = z.object({
  key: templateKeySchema,
  /**
   * Required — every template row belongs to a specific Language. The
   * client picks one from the languages list rendered server-side; the
   * server still validates the id exists in the DB before insert.
   */
  languageId: z.string().trim().min(1, "Language is required"),
  name: z.string().trim().min(1, "Name is required").max(120),
  subject: z.string().trim().min(1, "Subject is required").max(255),
  bodyText: z.string().min(1, "Plain-text body is required"),
  bodyHtml: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});
export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;

export const updateEmailTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    subject: z.string().trim().min(1).max(255).optional(),
    bodyText: z.string().min(1).optional(),
    bodyHtml: z.string().nullable().optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const updateSmtpSettingsSchema = z.object({
  host: optionalTrimmed(255),
  port: z
    .union([z.number().int().min(1).max(65_535), z.literal("")])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  user: optionalTrimmed(255),
  /**
   * Empty string means "leave the existing password untouched"; null means
   * "clear it"; any non-empty string overwrites. The form sends "" when the
   * password input is left blank.
   */
  pass: z
    .string()
    .max(255)
    .optional()
    .transform((v): string | null | undefined => {
      if (v === undefined || v === "") return undefined;
      return v;
    }),
  from: optionalTrimmed(255),
});
export type UpdateSmtpSettingsInput = z.infer<typeof updateSmtpSettingsSchema>;

export const testEmailSchema = z.object({ to: emailSchema });
export type TestEmailInput = z.infer<typeof testEmailSchema>;

const surveyNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be at most 120 characters");

// The trim runs at parse time; emptyish input arrives as `null` from the
// client (see the editor forms), so we keep the schema shape narrow and
// don't collapse `undefined` to `null` here — the `refine` checks below
// rely on `undefined` meaning "field omitted from PATCH".
const surveyDescriptionSchema = z
  .string()
  .trim()
  .max(2_000, "Description must be at most 2000 characters")
  .nullable()
  .optional();

const stepTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(160, "Title must be at most 160 characters");

const stepNotesSchema = z
  .string()
  .trim()
  .max(4_000, "Notes must be at most 4000 characters")
  .nullable()
  .optional();

const stepTypeSchema = z.enum(STEP_TYPE_KEYS as [string, ...string[]], {
  errorMap: () => ({ message: "Unknown step type" }),
});

/**
 * Accepts `options` either as a newline-separated string (form input)
 * or a string array (programmatic). Normalises to either a non-empty
 * trimmed newline-separated string, or null when the type doesn't use
 * options. Choice-style types must end up with at least 2 options.
 */
const stepOptionsSchema = z
  .union([z.string().max(4_000), z.array(z.string()), z.null()])
  .optional();

export const createSurveySchema = z.object({
  name: surveyNameSchema,
  description: surveyDescriptionSchema,
});
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;

export const updateSurveySchema = z
  .object({
    name: surveyNameSchema.optional(),
    description: surveyDescriptionSchema,
  })
  .refine((d) => d.name !== undefined || d.description !== undefined, {
    message: "Provide at least one field to update",
  });
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;

export const setPublishedSchema = z.object({ published: z.boolean() });
export type SetPublishedInput = z.infer<typeof setPublishedSchema>;

function normalizeOptionsForType(
  type: string,
  raw: string | string[] | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const list = Array.isArray(raw)
    ? raw.map((s) => s.trim()).filter((s) => s.length > 0)
    : parseOptions(raw ?? null);

  if (stepTypeRequiresOptions(type)) {
    if (list.length < 2) {
      return { ok: false, error: "Choice steps need at least two options" };
    }
    if (list.some((o) => o.length > 200)) {
      return { ok: false, error: "Each option must be at most 200 characters" };
    }
    return { ok: true, value: list.join("\n") };
  }
  // Non-choice types ignore any submitted options to keep the column tidy.
  return { ok: true, value: null };
}

export const createStepSchema = z.object({
  type: stepTypeSchema,
  title: stepTitleSchema,
  notes: stepNotesSchema,
  options: stepOptionsSchema,
});
export type CreateStepInput = z.infer<typeof createStepSchema>;

export const updateStepSchema = z
  .object({
    type: stepTypeSchema.optional(),
    title: stepTitleSchema.optional(),
    notes: stepNotesSchema,
    options: stepOptionsSchema,
  })
  .refine(
    (d) =>
      d.type !== undefined ||
      d.title !== undefined ||
      d.notes !== undefined ||
      d.options !== undefined,
    { message: "Provide at least one field to update" },
  );
export type UpdateStepInput = z.infer<typeof updateStepSchema>;

export const reorderStepsSchema = z.object({
  stepIds: z.array(z.string().min(1)).min(1, "Provide at least one step id"),
});
export type ReorderStepsInput = z.infer<typeof reorderStepsSchema>;

/** Public-form submission. Each entry maps a step id to the answer the
 *  respondent gave. Multi-choice answers come in as arrays; everything
 *  else is a string. The route handler decides per-step whether each
 *  shape is valid given the step's type. */
export const submitResponseSchema = z.object({
  answers: z
    .array(
      z.object({
        stepId: z.string().min(1),
        value: z.union([z.string().max(10_000), z.array(z.string().max(500))]),
      }),
    )
    .max(500),
});
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

export { normalizeOptionsForType };

/**
 * `createLanguageSchema` accepts a `(countryCode, languageCode)` pair
 * and rejects anything that isn't in the curated dataset
 * (`src/lib/locales.ts`). Country codes are forced upper-case,
 * languages lower-case, so DB rows stay canonical regardless of how
 * the client casing arrives.
 */
export const createLanguageSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Country code must be ISO 3166-1 alpha-2"),
    languageCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2,3}$/, "Language code must be ISO 639-1"),
  })
  .refine((d) => isValidCountryLanguage(d.countryCode, d.languageCode), {
    message: "Language is not recognised for the chosen country",
    path: ["languageCode"],
  });
export type CreateLanguageInput = z.infer<typeof createLanguageSchema>;

/**
 * PATCH body for /api/super-admin/translations — upserts one translated
 * value. The empty string is allowed (and means "fall back to default
 * language at lookup time") so admins can blank out a translation
 * without an explicit delete endpoint.
 */
export const updateTranslationSchema = z.object({
  translationKeyId: z.string().trim().min(1, "translationKeyId is required"),
  languageId: z.string().trim().min(1, "languageId is required"),
  value: z.string().max(8_192, "Translation must be at most 8192 characters"),
});
export type UpdateTranslationInput = z.infer<typeof updateTranslationSchema>;

/**
 * Body for POST /api/super-admin/translations/auto-translate.
 * `scope` chooses what to translate:
 *   - "missing": rows that are absent or empty for the target language
 *   - "all":     every key — re-translate even where a value exists
 *   - object:    explicit subset of TranslationKey ids
 * `commit: true` writes the result (with `source = "auto"`); false
 * returns suggestions without persisting.
 */
export const autoTranslateRequestSchema = z.object({
  languageId: z.string().trim().min(1, "languageId is required"),
  scope: z.union([
    z.literal("missing"),
    z.literal("all"),
    z.object({
      keyIds: z
        .array(z.string().trim().min(1))
        .min(1, "Provide at least one keyId")
        .max(500, "Too many keys in a single request"),
    }),
  ]),
  commit: z.boolean().default(false),
});
export type AutoTranslateRequestInput = z.infer<typeof autoTranslateRequestSchema>;

/**
 * Body for PATCH /api/super-admin/system-settings/translate-provider.
 * `apiKey` of `""` (empty string) is treated as "leave it untouched"
 * to match the SMTP form convention; pass `null` to clear it.
 */
const optionalApiKeyField = z
  .union([z.string().max(255), z.null()])
  .optional()
  .transform((v): string | null | undefined => {
    if (v === undefined || v === "") return undefined;
    return v;
  });

export const updateTranslateSettingsSchema = z.object({
  provider: z.enum(["anthropic", "openai", "deepl"]),
  anthropicModel: z.string().trim().max(120).optional(),
  anthropicApiKey: optionalApiKeyField,
  openaiModel: z.string().trim().max(120).optional(),
  openaiApiKey: optionalApiKeyField,
  deeplApiKey: optionalApiKeyField,
});
export type UpdateTranslateSettingsInput = z.infer<typeof updateTranslateSettingsSchema>;

export const themePreferenceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
});
export type ThemePreferenceInput = z.infer<typeof themePreferenceSchema>;

export const updateLogRetentionSchema = z.object({
  // 0 means "never prune". Cap at ~10 years just to keep the input sane.
  errorDays: z.number().int().min(0).max(3_650),
  warningDays: z.number().int().min(0).max(3_650),
  infoDays: z.number().int().min(0).max(3_650),
});
export type UpdateLogRetentionInput = z.infer<typeof updateLogRetentionSchema>;

/**
 * Body for POST /api/super-admin/tasks/{id}/assign — admin picks a
 * task definition (the `{id}` segment) and a target user. Per U4 in
 * the tasks plan, the handler then creates a pending TaskInstance for
 * that user, evaluates the predicate immediately, and either silently
 * auto-completes (matching predicate, AE5b) or dispatches a
 * task_created notification + email (non-matching or no predicate,
 * AE5). `.strict()` rejects any stray field so the admin client and
 * server stay in lockstep.
 */
export const assignTaskInstanceSchema = z
  .object({ userId: z.string().trim().min(1, "userId is required") })
  .strict();
export type AssignTaskInstanceInput = z.infer<typeof assignTaskInstanceSchema>;

/**
 * Body for POST /api/super-admin/tasks/{id}/enable — admin flips a
 * task definition from disabled to enabled and chooses whether the
 * backfill notifies existing users (in-app + email) or runs silently.
 * Default in the BackfillDialog is silent. `.strict()` keeps the
 * contract narrow so a typo in the client doesn't accidentally
 * trigger a 1k-email blast.
 */
export const enableTaskSchema = z
  .object({ notify: z.boolean() })
  .strict();
export type EnableTaskInput = z.infer<typeof enableTaskSchema>;

/**
 * Task trigger discriminated union (U7). Each variant is `.strict()`
 * so trigger-shape mistakes (e.g. `dates` on a `recurring` row) fail
 * at the validator boundary instead of being silently dropped. Used by
 * `createTaskSchema` / `updateTaskSchema` below.
 *
 * Validator shape vs DB shape:
 *   - `specific_date` carries `dates: string[]` in the wire format
 *     because arrays are the natural shape for a client / OpenAPI doc.
 *   - The DB column is `TaskTrigger.dateList String?` (newline-joined),
 *     so handlers convert at the boundary: `dateList = dates.join('\n')`
 *     on write; readers split on `'\n'`.
 *
 * The signup / manual_assign variants carry no sub-fields and
 * intentionally `.strict()` to reject `intervalDays` / `dates` so a
 * client form bug can't smuggle stray config into a no-config trigger.
 */
const signupTriggerSchema = z
  .object({ kind: z.literal("signup") })
  .strict();

const manualAssignTriggerSchema = z
  .object({ kind: z.literal("manual_assign") })
  .strict();

const recurringTriggerSchema = z
  .object({
    kind: z.literal("recurring"),
    intervalDays: z
      .number()
      .int("intervalDays must be an integer")
      .min(1, "intervalDays must be at least 1"),
  })
  .strict();

const specificDateTriggerSchema = z
  .object({
    kind: z.literal("specific_date"),
    dates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Each date must be YYYY-MM-DD"))
      .min(1, "Provide at least one date"),
  })
  .strict();

export const taskTriggerSchema = z.discriminatedUnion("kind", [
  signupTriggerSchema,
  manualAssignTriggerSchema,
  recurringTriggerSchema,
  specificDateTriggerSchema,
]);
export type TaskTriggerInput = z.infer<typeof taskTriggerSchema>;

const taskTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(160, "Title must be at most 160 characters");

const taskDescriptionSchema = z
  .string()
  .trim()
  .max(4_000, "Description must be at most 4000 characters")
  .nullable()
  .optional();

const taskPredicateKeySchema = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .refine(
    (v) => v == null || (KNOWN_PREDICATE_KEYS as ReadonlyArray<string>).includes(v),
    {
      message: "Unknown predicate key",
    },
  );

/**
 * Body for POST /api/super-admin/tasks — create a task definition with
 * its trigger list in a single round-trip (U7). `predicateKey` is
 * either one of the `KNOWN_PREDICATES` keys (the engineering-maintained
 * registry in `src/lib/predicates.ts`) or null/omitted for the
 * "manual / trust user" sentinel. `triggers` must be non-empty —
 * a definition with no trigger has no path to ever create an instance,
 * which is a misconfiguration we reject at the validator instead of
 * silently shipping a dead task. `enabled` defaults to false so admins
 * draft tasks before flipping them on (which routes through the
 * dedicated enable endpoint that runs the backfill — see U5).
 */
export const createTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: taskDescriptionSchema,
    predicateKey: taskPredicateKeySchema,
    triggers: z.array(taskTriggerSchema).min(1, "Provide at least one trigger"),
    enabled: z.boolean().optional(),
  })
  .strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Body for PATCH /api/super-admin/tasks/{id} — partial update. Every
 * field is optional; omitted fields are left untouched. When
 * `triggers` is present it replaces the full trigger list (handler
 * deletes the old rows and inserts the new ones in one transaction).
 * `enabled` is NOT toggled through PATCH for the disabled→enabled
 * transition — that path routes through the dedicated enable endpoint
 * so the backfill + 422 cap pre-check fire. PATCH is allowed for
 * enabled→disabled (kept simple; no backfill side effects).
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: taskDescriptionSchema,
    predicateKey: taskPredicateKeySchema,
    triggers: z.array(taskTriggerSchema).min(1, "Provide at least one trigger").optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.title !== undefined ||
      d.description !== undefined ||
      d.predicateKey !== undefined ||
      d.triggers !== undefined ||
      d.enabled !== undefined,
    { message: "Provide at least one field to update" },
  );
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * Body for POST /api/super-admin/tasks/tick — the external-cron-callable
 * scheduler entry point. The body is intentionally empty because the
 * tick takes no user-controllable parameters; all knobs live in
 * SystemSetting. `.strict()` rejects any stray field so a cron job
 * misconfigured with `{ secret: ... }` in the body fails loudly
 * instead of silently — the secret only ever travels via the
 * `X-Tick-Secret` header.
 */
export const tickRequestSchema = z.object({}).strict();
export type TickRequestInput = z.infer<typeof tickRequestSchema>;

/**
 * Query parameters for `GET /api/super-admin/tasks/instances` — the U8
 * admin global instance overview list endpoint. Filters compose with
 * AND semantics; all are optional so the bare endpoint returns the
 * most recent page of every instance ordered by `(createdAt DESC, id
 * DESC)`.
 *
 * Cursor pagination uses a `<createdAtIso>_<id>` opaque string so the
 * server can decode it into the `(createdAt, id)` tuple comparison
 * `WHERE (createdAt, id) < (cursorCreatedAt, cursorId)`. We avoid
 * base64 because the value never leaves the admin surface — the
 * underscore-joined form is easier to debug in the URL bar and on
 * logs without changing semantics.
 *
 * `limit` is coerced from the URL string and clamped to [1, 100] so a
 * stray `?limit=0` or `?limit=99999` can't break the table render or
 * exhaust memory.
 *
 * `.strict()` keeps the contract narrow — a typo like `?staus=pending`
 * fails at the validator instead of silently being ignored.
 */
export const instanceListQuerySchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    taskId: z.string().trim().min(1).optional(),
    status: z.enum(["pending", "completed"]).optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type InstanceListQueryInput = z.infer<typeof instanceListQuerySchema>;

/**
 * Body for POST /api/notifications/mark-read — the bell-dropdown-open
 * + `/tasks`-visit bulk mark-read endpoint. No body fields: scope is
 * always `session.user.id`, never accepted as a parameter. The schema
 * exists for OpenAPI completeness (so the docs render a request body
 * shape) and to enforce the cross-user IDOR boundary structurally —
 * `.strict()` rejects any stray field so a misbehaving client sending
 * `{ userId: ... }` fails loudly instead of having the field silently
 * ignored.
 */
export const markNotificationsReadSchema = z.object({}).strict();
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

export const clientLogEntrySchema = z.object({
  level: z.enum(["error", "warning", "info"]),
  name: z.string().max(255).nullable().optional(),
  message: z.string().min(1).max(8_192),
  stack: z.string().max(64_000).nullable().optional(),
  // The client-supplied context is opaque JSON the caller passed deliberately.
  // Stored as-is (capped + stringified) on the server.
  context: z.unknown().optional(),
  url: z.string().max(2_048).nullable().optional(),
  userAgent: z.string().max(1_024).nullable().optional(),
});
export type ClientLogEntryInput = z.infer<typeof clientLogEntrySchema>;
