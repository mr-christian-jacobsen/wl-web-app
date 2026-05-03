import { z } from "zod";

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

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine((d) => d.name !== undefined || d.email !== undefined, {
    message: "Provide at least one field to update",
  });
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
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    isSuperAdmin: z.boolean().optional(),
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
