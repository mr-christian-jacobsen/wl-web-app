import { z } from "zod";

import { isValidCountryLanguage } from "@/lib/locales";
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
  })
  .refine(
    (d) => d.name !== undefined || d.email !== undefined || d.languageId !== undefined,
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
