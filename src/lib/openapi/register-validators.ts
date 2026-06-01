// Wraps the existing validators in `src/lib/validators.ts` with OpenAPI
// metadata. Kept as a separate side-effect module so `validators.ts` stays a
// pure parsing layer with no doc-tool coupling. Importing this file registers
// each schema under a stable name; route definitions then reference them by
// that name in the generated spec.

import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  assignTaskInstanceSchema,
  createTaskSchema,
  enableTaskSchema,
  instanceListQuerySchema,
  markNotificationsReadSchema,
  taskTriggerSchema,
  tickRequestSchema,
  updateTaskSchema,
  autoTranslateRequestSchema,
  changePasswordSchema,
  clientLogEntrySchema,
  createEmailTemplateSchema,
  createLanguageSchema,
  createStepSchema,
  createSurveySchema,
  forgotPasswordSchema,
  reorderStepsSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  setPublishedSchema,
  signupSchema,
  submitResponseSchema,
  testEmailSchema,
  themePreferenceSchema,
  updateEmailTemplateSchema,
  updateLogRetentionSchema,
  updateProfileSchema,
  updateSmtpSettingsSchema,
  updateStepSchema,
  updateSurveySchema,
  updateTranslateSettingsSchema,
  updateTranslationSchema,
  verifyEmailSchema,
} from "@/lib/validators";

import { registry } from "./registry";

// Each call returns the registered (named) reference; we don't use them
// directly but the registration side effect adds the schema to the spec's
// `components.schemas` map under the given key.
registry.register("SignupInput", signupSchema);
registry.register("ForgotPasswordInput", forgotPasswordSchema);
registry.register("ResetPasswordInput", resetPasswordSchema);
registry.register("VerifyEmailInput", verifyEmailSchema);
registry.register("ResendVerificationInput", resendVerificationSchema);
registry.register("UpdateProfileInput", updateProfileSchema);
registry.register("ChangePasswordInput", changePasswordSchema);
registry.register("ThemePreferenceInput", themePreferenceSchema);
registry.register("AdminCreateUserInput", adminCreateUserSchema);
registry.register("AdminUpdateUserInput", adminUpdateUserSchema);
registry.register("CreateEmailTemplateInput", createEmailTemplateSchema);
registry.register("UpdateEmailTemplateInput", updateEmailTemplateSchema);
registry.register("CreateSurveyInput", createSurveySchema);
registry.register("UpdateSurveyInput", updateSurveySchema);
registry.register("SetPublishedInput", setPublishedSchema);
registry.register("CreateStepInput", createStepSchema);
registry.register("UpdateStepInput", updateStepSchema);
registry.register("ReorderStepsInput", reorderStepsSchema);
registry.register("SubmitResponseInput", submitResponseSchema);
registry.register("CreateLanguageInput", createLanguageSchema);
registry.register("UpdateTranslationInput", updateTranslationSchema);
registry.register("AutoTranslateRequestInput", autoTranslateRequestSchema);
registry.register("UpdateSmtpSettingsInput", updateSmtpSettingsSchema);
registry.register("TestEmailInput", testEmailSchema);
registry.register("UpdateTranslateSettingsInput", updateTranslateSettingsSchema);
registry.register("UpdateLogRetentionInput", updateLogRetentionSchema);
registry.register("ClientLogEntryInput", clientLogEntrySchema);
registry.register("AssignTaskInstanceInput", assignTaskInstanceSchema);
registry.register("EnableTaskInput", enableTaskSchema);
registry.register("TickRequestInput", tickRequestSchema);
registry.register("MarkNotificationsReadInput", markNotificationsReadSchema);
registry.register("TaskTriggerInput", taskTriggerSchema);
registry.register("CreateTaskInput", createTaskSchema);
registry.register("UpdateTaskInput", updateTaskSchema);
registry.register("InstanceListQueryInput", instanceListQuerySchema);
