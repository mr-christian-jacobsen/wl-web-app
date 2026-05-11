import {
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from "@/lib/validators";

import {
  ErrorResponse,
  jsonResponse,
  OkResponse,
  registry,
  TAGS,
  validationErrorResponse,
  z,
} from "../registry";

export function registerAuthRoutes() {
  registry.registerPath({
    method: "post",
    path: "/api/auth/signup",
    tags: [TAGS.Auth],
    summary: "Create an account",
    description:
      "Creates a new user with an unverified email and sends a verification link. Returns 409 if the email is already registered.",
    request: {
      body: {
        content: { "application/json": { schema: signupSchema } },
        required: true,
      },
    },
    responses: {
      201: {
        description: "User created; verification email dispatched.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              requiresVerification: z.literal(true),
            }),
          },
        },
      },
      ...validationErrorResponse(),
      409: {
        description: "Email already in use.",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/forgot-password",
    tags: [TAGS.Auth],
    summary: "Request a password-reset link",
    description:
      "Always returns 200 to avoid leaking which emails are registered. A reset link is sent only when a matching account exists.",
    request: {
      body: {
        content: { "application/json": { schema: forgotPasswordSchema } },
        required: true,
      },
    },
    responses: jsonResponse("Always 200 — no account-existence signal.", OkResponse),
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/reset-password",
    tags: [TAGS.Auth],
    summary: "Consume a reset token and set a new password",
    request: {
      body: {
        content: { "application/json": { schema: resetPasswordSchema } },
        required: true,
      },
    },
    responses: {
      ...jsonResponse("Password updated.", OkResponse),
      ...validationErrorResponse(),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/verify-email",
    tags: [TAGS.Auth],
    summary: "Verify a signup or email-change token",
    request: {
      body: {
        content: { "application/json": { schema: verifyEmailSchema } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Verification succeeded.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              purpose: z.enum(["signup", "change"]),
            }),
          },
        },
      },
      400: {
        description: "Token invalid, expired, or already used.",
        content: { "application/json": { schema: ErrorResponse } },
      },
      409: {
        description: "Target email already in use (email-change flow).",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/resend-verification",
    tags: [TAGS.Auth],
    summary: "Resend a signup verification email",
    description:
      "Always returns 200 — same anti-enumeration policy as forgot-password.",
    request: {
      body: {
        content: { "application/json": { schema: resendVerificationSchema } },
        required: true,
      },
    },
    responses: jsonResponse("Always 200.", OkResponse),
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/signout",
    tags: [TAGS.Auth],
    summary: "Destroy the current session",
    security: [{ sessionCookie: [] }],
    responses: jsonResponse("Session cleared.", OkResponse),
  });
}
