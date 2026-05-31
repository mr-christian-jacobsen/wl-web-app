import { describe, expect, it } from "vitest";

import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  changePasswordSchema,
  createEmailTemplateSchema,
  enableTaskSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  updateEmailTemplateSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "@/lib/validators";

describe("validators", () => {
  it("normalizes signup email and accepts strong password", () => {
    const r = signupSchema.parse({ email: "  Foo@Bar.com ", name: "Foo", password: "abcdefgh" });
    expect(r.email).toBe("foo@bar.com");
    expect(r.name).toBe("Foo");
  });

  it("rejects short passwords", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", name: "x", password: "short" }).success).toBe(
      false,
    );
  });

  it("login schema requires email + password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "abcdefgh" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "nope", password: "abcdefgh" }).success).toBe(false);
  });

  it("forgot-password schema validates email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "x" }).success).toBe(false);
  });

  it("reset-password schema requires 32+ char token", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "x".repeat(32), password: "abcdefgh" }).success,
    ).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "short", password: "abcdefgh" }).success).toBe(
      false,
    );
  });

  it("update-profile requires at least one field", () => {
    expect(updateProfileSchema.safeParse({ name: "foo" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ languageId: "x" }).success).toBe(true);
    // null clears the preference
    expect(updateProfileSchema.safeParse({ languageId: null }).success).toBe(true);
    // empty string is rejected so empty form fields can't accidentally
    // null the preference — clients must explicitly send `null`.
    expect(updateProfileSchema.safeParse({ languageId: "" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("admin-create-user requires email/name/password and defaults isSuperAdmin to false", () => {
    const r = adminCreateUserSchema.parse({
      email: "Admin@Example.com",
      name: "Admin",
      password: "abcdefgh",
    });
    expect(r.email).toBe("admin@example.com");
    expect(r.isSuperAdmin).toBe(false);

    const r2 = adminCreateUserSchema.parse({
      email: "admin2@example.com",
      name: "Admin 2",
      password: "abcdefgh",
      isSuperAdmin: true,
    });
    expect(r2.isSuperAdmin).toBe(true);
  });

  it("admin-update-user accepts partial updates", () => {
    expect(adminUpdateUserSchema.safeParse({ name: "x" }).success).toBe(true);
    expect(adminUpdateUserSchema.safeParse({ isSuperAdmin: true }).success).toBe(true);
    expect(adminUpdateUserSchema.safeParse({ password: "abcdefgh" }).success).toBe(true);
    expect(adminUpdateUserSchema.safeParse({ languageId: "lang-1" }).success).toBe(true);
    expect(adminUpdateUserSchema.safeParse({ languageId: null }).success).toBe(true);
    expect(adminUpdateUserSchema.safeParse({ languageId: "" }).success).toBe(false);
    expect(adminUpdateUserSchema.safeParse({}).success).toBe(false);
    expect(
      adminUpdateUserSchema.safeParse({ email: "not-email", isSuperAdmin: true }).success,
    ).toBe(false);
  });

  it("admin-create-user accepts optional languageId", () => {
    const r = adminCreateUserSchema.parse({
      email: "a@b.co",
      name: "X",
      password: "abcdefgh",
      languageId: "lang-1",
    });
    expect(r.languageId).toBe("lang-1");
    // null is accepted; means "no preference"
    expect(
      adminCreateUserSchema.safeParse({
        email: "a@b.co",
        name: "X",
        password: "abcdefgh",
        languageId: null,
      }).success,
    ).toBe(true);
    // empty string is rejected so empty form fields can't smuggle in
    // an invalid id
    expect(
      adminCreateUserSchema.safeParse({
        email: "a@b.co",
        name: "X",
        password: "abcdefgh",
        languageId: "",
      }).success,
    ).toBe(false);
  });

  it("create-email-template enforces snake_case key + required fields", () => {
    const ok = createEmailTemplateSchema.safeParse({
      key: "user_invitation",
      languageId: "lang-id-1",
      name: "User invitation",
      subject: "Welcome {{name}}",
      bodyText: "Hi {{name}}",
    });
    expect(ok.success).toBe(true);

    expect(
      createEmailTemplateSchema.safeParse({
        key: "Bad-Key",
        languageId: "lang-id-1",
        name: "x",
        subject: "y",
        bodyText: "z",
      }).success,
    ).toBe(false);

    expect(
      createEmailTemplateSchema.safeParse({
        key: "user_invitation",
        languageId: "lang-id-1",
        name: "x",
        subject: "y",
        bodyText: "",
      }).success,
    ).toBe(false);

    // languageId is required
    expect(
      createEmailTemplateSchema.safeParse({
        key: "user_invitation",
        name: "x",
        subject: "y",
        bodyText: "z",
      }).success,
    ).toBe(false);
  });

  it("update-email-template requires at least one field", () => {
    expect(updateEmailTemplateSchema.safeParse({ subject: "new" }).success).toBe(true);
    expect(updateEmailTemplateSchema.safeParse({ bodyHtml: null }).success).toBe(true);
    expect(updateEmailTemplateSchema.safeParse({}).success).toBe(false);
  });

  it("verify-email schema requires 32+ char token", () => {
    expect(verifyEmailSchema.safeParse({ token: "x".repeat(32) }).success).toBe(true);
    expect(verifyEmailSchema.safeParse({ token: "short" }).success).toBe(false);
  });

  it("resend-verification schema validates email", () => {
    expect(resendVerificationSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(resendVerificationSchema.safeParse({ email: "x" }).success).toBe(false);
  });

  it("change-password rejects identical old/new", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "abcdefgh",
        newPassword: "abcdefgh",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "abcdefgh",
        newPassword: "12345678",
      }).success,
    ).toBe(true);
  });

  // U5: enable-task body — `notify` must be present and boolean. Strict
  // mode rejects extra fields so a typo in the client doesn't
  // accidentally trigger a 1k-email blast through a sloppy default.
  describe("enableTaskSchema", () => {
    it("accepts { notify: true } and { notify: false }", () => {
      expect(enableTaskSchema.safeParse({ notify: true }).success).toBe(true);
      expect(enableTaskSchema.safeParse({ notify: false }).success).toBe(true);
    });

    it("rejects missing notify", () => {
      expect(enableTaskSchema.safeParse({}).success).toBe(false);
    });

    it("rejects non-boolean notify (string 'true' is a common client mistake)", () => {
      expect(enableTaskSchema.safeParse({ notify: "true" }).success).toBe(false);
      expect(enableTaskSchema.safeParse({ notify: 1 }).success).toBe(false);
      expect(enableTaskSchema.safeParse({ notify: null }).success).toBe(false);
    });

    it("rejects unknown extra fields (strict mode)", () => {
      expect(
        enableTaskSchema.safeParse({ notify: true, force: true }).success,
      ).toBe(false);
    });
  });
});
