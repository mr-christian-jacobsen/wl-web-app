import { describe, expect, it } from "vitest";

import { generateResetToken, hashResetToken } from "@/lib/tokens";

describe("tokens", () => {
  it("generates URL-safe token with matching SHA-256 hash", () => {
    const { token, tokenHash } = generateResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hashResetToken(token)).toBe(tokenHash);
  });

  it("produces a different token each call", () => {
    const a = generateResetToken().token;
    const b = generateResetToken().token;
    expect(a).not.toBe(b);
  });
});
