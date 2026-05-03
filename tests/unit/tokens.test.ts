import { describe, expect, it } from "vitest";

import { generateToken, hashToken } from "@/lib/tokens";

describe("tokens", () => {
  it("generates URL-safe token with matching SHA-256 hash", () => {
    const { token, tokenHash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hashToken(token)).toBe(tokenHash);
  });

  it("produces a different token each call", () => {
    const a = generateToken().token;
    const b = generateToken().token;
    expect(a).not.toBe(b);
  });
});
