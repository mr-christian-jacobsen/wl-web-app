import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
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
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
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
});
