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
