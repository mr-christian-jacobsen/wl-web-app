import { describe, expect, it } from "vitest";

import {
  DEFAULT_STEP_TYPE_KEY,
  STEP_TYPE_KEYS,
  STEP_TYPES,
  getStepType,
  parseOptions,
  stepTypeRequiresOptions,
} from "@/lib/step-types";
import {
  createStepSchema,
  createSurveySchema,
  normalizeOptionsForType,
  setPublishedSchema,
  submitResponseSchema,
  updateStepSchema,
} from "@/lib/validators";

describe("step-types registry", () => {
  it("default key is in the registry", () => {
    expect(STEP_TYPE_KEYS).toContain(DEFAULT_STEP_TYPE_KEY);
  });

  it("getStepType falls back to a synthetic 'unknown' type for unknown keys", () => {
    const t = getStepType("not_a_real_type");
    expect(t.key).toBe("not_a_real_type");
    expect(t.label).toBe("Unknown");
    expect(t.icon).toMatch(/^data:image\/svg/);
  });

  it("known keys round-trip through getStepType unchanged", () => {
    for (const t of STEP_TYPES) {
      expect(getStepType(t.key).label).toBe(t.label);
    }
  });

  it("flags choice types as requiring options", () => {
    expect(stepTypeRequiresOptions("single_choice")).toBe(true);
    expect(stepTypeRequiresOptions("multi_choice")).toBe(true);
    expect(stepTypeRequiresOptions("short_text")).toBe(false);
    expect(stepTypeRequiresOptions("rating")).toBe(false);
  });

  it("parseOptions splits, trims and drops blanks", () => {
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions("")).toEqual([]);
    expect(parseOptions(" a \nb\n\n  c ")).toEqual(["a", "b", "c"]);
  });
});

describe("normalizeOptionsForType", () => {
  it("returns null for non-choice types regardless of input", () => {
    expect(normalizeOptionsForType("short_text", "ignored")).toEqual({ ok: true, value: null });
    expect(normalizeOptionsForType("rating", ["a", "b"])).toEqual({ ok: true, value: null });
    expect(normalizeOptionsForType("yes_no", null)).toEqual({ ok: true, value: null });
  });

  it("requires at least two options for choice types", () => {
    const r = normalizeOptionsForType("single_choice", "only one");
    expect(r.ok).toBe(false);
  });

  it("accepts a string-array of options for choice types", () => {
    const r = normalizeOptionsForType("multi_choice", ["red", "green", "blue"]);
    expect(r).toEqual({ ok: true, value: "red\ngreen\nblue" });
  });

  it("rejects options longer than 200 chars", () => {
    const tooLong = "x".repeat(201);
    const r = normalizeOptionsForType("single_choice", ["ok", tooLong]);
    expect(r.ok).toBe(false);
  });
});

describe("survey + step validators", () => {
  it("createSurveySchema requires a name", () => {
    expect(createSurveySchema.safeParse({ name: "", description: null }).success).toBe(false);
    expect(createSurveySchema.safeParse({ name: "  My survey  " }).success).toBe(true);
  });

  it("createStepSchema rejects unknown types", () => {
    const r = createStepSchema.safeParse({ type: "decision", title: "X" });
    expect(r.success).toBe(false);
  });

  it("createStepSchema accepts options blob without enforcing it", () => {
    // Options validation happens at the route boundary via
    // normalizeOptionsForType — the schema itself just shapes the input.
    const r = createStepSchema.safeParse({
      type: "single_choice",
      title: "Pick",
      options: "a\nb",
    });
    expect(r.success).toBe(true);
  });

  it("updateStepSchema requires at least one field", () => {
    expect(updateStepSchema.safeParse({}).success).toBe(false);
    expect(updateStepSchema.safeParse({ title: "x" }).success).toBe(true);
  });

  it("setPublishedSchema accepts only booleans", () => {
    expect(setPublishedSchema.safeParse({ published: true }).success).toBe(true);
    expect(setPublishedSchema.safeParse({ published: "yes" }).success).toBe(false);
  });
});

describe("submitResponseSchema", () => {
  it("accepts mixed string and array values", () => {
    const r = submitResponseSchema.safeParse({
      answers: [
        { stepId: "a", value: "hello" },
        { stepId: "b", value: ["one", "two"] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("caps answer count at 500", () => {
    const answers = Array.from({ length: 501 }, (_, i) => ({
      stepId: `s${i}`,
      value: "x",
    }));
    expect(submitResponseSchema.safeParse({ answers }).success).toBe(false);
  });
});
