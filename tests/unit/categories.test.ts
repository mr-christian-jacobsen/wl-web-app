import { describe, expect, it } from "vitest";

import { categoriesEqualByNameCi } from "@/lib/categories";

describe("categoriesEqualByNameCi", () => {
  it("treats different casing as equal", () => {
    expect(categoriesEqualByNameCi("Compliance", "compliance")).toBe(true);
  });

  it("treats surrounding whitespace as equal (trims both sides)", () => {
    expect(categoriesEqualByNameCi("  Compliance  ", "compliance")).toBe(true);
    expect(categoriesEqualByNameCi("Compliance", "  COMPLIANCE\t")).toBe(true);
  });

  it("treats different names as not equal", () => {
    expect(categoriesEqualByNameCi("Audience", "Topic")).toBe(false);
  });

  it("treats names with internal whitespace differences as not equal", () => {
    // Trim only handles edge whitespace — internal whitespace differences
    // are real differences for the duplicate-name pre-check.
    expect(categoriesEqualByNameCi("North America", "North  America")).toBe(false);
  });

  it("is symmetric", () => {
    expect(categoriesEqualByNameCi("a", "A")).toBe(categoriesEqualByNameCi("A", "a"));
  });
});
