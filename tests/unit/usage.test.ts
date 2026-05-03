import { describe, expect, it } from "vitest";

import { hashIp, parseUserAgent } from "@/lib/usage";

describe("parseUserAgent", () => {
  it("returns null/other for a missing UA", () => {
    expect(parseUserAgent(null)).toEqual({
      os: null,
      osVersion: null,
      browser: null,
      browserVersion: null,
      deviceType: "other",
    });
  });

  it("parses a Chrome on macOS UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.71 Safari/537.36";
    const r = parseUserAgent(ua);
    expect(r.browser).toBe("Chrome");
    expect(r.os).toContain("macOS");
    expect(r.browserVersion?.startsWith("120")).toBe(true);
  });

  it("parses an iPhone Safari UA as mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const r = parseUserAgent(ua);
    expect(r.deviceType).toBe("mobile");
    expect(r.os).toBe("iOS");
  });
});

describe("hashIp", () => {
  it("returns null for empty input", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp("")).toBeNull();
  });

  it("returns a 16-char hex hash that's stable for the same input", () => {
    const a = hashIp("203.0.113.42");
    const b = hashIp("203.0.113.42");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs across IPs", () => {
    expect(hashIp("203.0.113.42")).not.toBe(hashIp("203.0.113.43"));
  });
});
