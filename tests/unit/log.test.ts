import { describe, expect, it } from "vitest";

import {
  buildFingerprintInput,
  scrubSecrets,
  topStackFrame,
  truncate,
} from "@/lib/log";

describe("truncate", () => {
  it("returns the input unchanged when under the cap", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the input unchanged when exactly at the cap", () => {
    const s = "x".repeat(10);
    expect(truncate(s, 10)).toBe(s);
  });

  it("cuts and appends a marker when over the cap", () => {
    const s = "x".repeat(100);
    const out = truncate(s, 32);
    expect(out.length).toBe(32);
    expect(out.endsWith("\n…[truncated]")).toBe(true);
  });
});

describe("topStackFrame", () => {
  it("returns empty for null/undefined/empty stacks", () => {
    expect(topStackFrame(null)).toBe("");
    expect(topStackFrame(undefined)).toBe("");
    expect(topStackFrame("")).toBe("");
  });

  it("picks the first 'at ' frame in a V8-style stack", () => {
    const stack = [
      "Error: kaboom",
      "    at fn (file.ts:10:5)",
      "    at outer (other.ts:99:1)",
    ].join("\n");
    expect(topStackFrame(stack)).toBe("at fn (file.ts)");
  });

  it("falls back to the first non-empty line when no 'at' frame is present", () => {
    const stack = "ReferenceError: x is not defined\n    something opaque";
    expect(topStackFrame(stack)).toBe("ReferenceError: x is not defined");
  });

  it("normalises line/column numbers, query strings, and pointer hex", () => {
    const stack = "    at handler (chunk.js?v=12345:42:17) [0xdeadbeef]";
    const out = topStackFrame(stack);
    // No :line:col, no query, no concrete pointer — but the frame core remains.
    expect(out).not.toMatch(/:\d+:\d+/);
    expect(out).not.toContain("?v=");
    expect(out).not.toContain("0xdeadbeef");
    expect(out).toContain("at handler");
  });
});

describe("buildFingerprintInput", () => {
  it("collapses numeric variation in the message", () => {
    const a = buildFingerprintInput({
      level: "error",
      name: "TypeError",
      message: "request 12345 failed",
      topFrame: "at fn (a.ts)",
    });
    const b = buildFingerprintInput({
      level: "error",
      name: "TypeError",
      message: "request 99 failed",
      topFrame: "at fn (a.ts)",
    });
    expect(a).toBe(b);
  });

  it("differs when level changes", () => {
    const error = buildFingerprintInput({
      level: "error",
      name: null,
      message: "x",
      topFrame: "",
    });
    const warning = buildFingerprintInput({
      level: "warning",
      name: null,
      message: "x",
      topFrame: "",
    });
    expect(error).not.toBe(warning);
  });

  it("differs when the top frame differs", () => {
    const a = buildFingerprintInput({ level: "error", name: null, message: "boom", topFrame: "at a (a.ts)" });
    const b = buildFingerprintInput({ level: "error", name: null, message: "boom", topFrame: "at b (b.ts)" });
    expect(a).not.toBe(b);
  });
});

describe("scrubSecrets", () => {
  it("masks Authorization Bearer headers", () => {
    expect(scrubSecrets("Authorization: Bearer abcdefghij1234567890")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("masks bare Bearer tokens in arbitrary text", () => {
    expect(scrubSecrets("trying Bearer abcdefghij1234567890 now")).toBe(
      "trying Bearer [REDACTED] now",
    );
  });

  it("masks key=value style credentials", () => {
    const out = scrubSecrets("got password=hunter2 and api_key=sk-abc123 here");
    expect(out).toContain("password=[REDACTED]");
    expect(out).toContain("api_key=[REDACTED]");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sk-abc123");
  });

  it("masks JSON-style secrets", () => {
    const out = scrubSecrets('{"password":"hunter2","name":"alex"}');
    expect(out).toContain('"password":"[REDACTED]"');
    expect(out).toContain('"name":"alex"');
  });

  it("masks JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(scrubSecrets(`token=${jwt}`)).not.toContain(jwt);
  });

  it("masks provider-prefixed keys (Resend, Stripe, GitHub, OpenAI, AWS)", () => {
    // Placeholder bodies (X-repeats) so GitHub's secret scanner doesn't flag
    // these as real test keys, while still matching the regexes in log.ts.
    const samples = [
      "re_XXXXXXXXXXXXXXXXXXXX",
      "sk_test_XXXXXXXXXXXXXXXXXXXX",
      "ghp_XXXXXXXXXXXXXXXXXXXX",
      "sk-XXXXXXXXXXXXXXXXXXXX",
      "AKIAXXXXXXXXXXXXXXXX",
    ];
    for (const s of samples) {
      expect(scrubSecrets(s)).not.toContain(s);
      expect(scrubSecrets(s)).toMatch(/REDACTED/);
    }
  });

  it("leaves benign text alone", () => {
    const benign = "Hello world. The user clicked button #42.";
    expect(scrubSecrets(benign)).toBe(benign);
  });
});
