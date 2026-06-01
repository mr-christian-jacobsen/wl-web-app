import { describe, expect, it } from "vitest";

import {
  createCategorySchema,
  createTagSchema,
  listTagsQuerySchema,
  paginationQuerySchema,
  replaceSurveyTagsSchema,
  updateCategorySchema,
  updateTagSchema,
} from "@/lib/validators";

// A valid cuid-looking string for inputs that require .cuid()
const CUID_A = "ckxxxxxxxxxxxxxxxxxxxxxxxx";
const CUID_B = "ckyyyyyyyyyyyyyyyyyyyyyyyy";

describe("paginationQuerySchema", () => {
  it("defaults page=1 pageSize=25 when both are absent", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it("coerces string params (URL params arrive as strings)", () => {
    expect(paginationQuerySchema.parse({ page: "3", pageSize: "10" })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it("rejects page=0 and pageSize=0", () => {
    expect(() => paginationQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => paginationQuerySchema.parse({ pageSize: 0 })).toThrow();
  });

  it("rejects pageSize over 100", () => {
    expect(() => paginationQuerySchema.parse({ pageSize: 101 })).toThrow();
  });
});

describe("createCategorySchema", () => {
  it("rejects empty name", () => {
    expect(() => createCategorySchema.parse({ name: "" })).toThrow();
    expect(() => createCategorySchema.parse({ name: "   " })).toThrow();
  });

  it("trims surrounding whitespace from name", () => {
    expect(createCategorySchema.parse({ name: "  Audience  " })).toEqual({
      name: "Audience",
    });
  });

  it("rejects name over 50 characters", () => {
    expect(() => createCategorySchema.parse({ name: "x".repeat(51) })).toThrow();
  });

  it("accepts an optional description and trims it", () => {
    expect(
      createCategorySchema.parse({ name: "Audience", description: "  who it's for  " }),
    ).toEqual({ name: "Audience", description: "who it's for" });
  });

  it("rejects description over 280 characters", () => {
    expect(() =>
      createCategorySchema.parse({ name: "Audience", description: "x".repeat(281) }),
    ).toThrow();
  });
});

describe("updateCategorySchema", () => {
  it("accepts an empty body (no fields touched)", () => {
    expect(updateCategorySchema.parse({})).toEqual({});
  });

  it("accepts a name-only edit", () => {
    expect(updateCategorySchema.parse({ name: "Topic" })).toEqual({ name: "Topic" });
  });
});

describe("createTagSchema", () => {
  it("defaults categoryIds to [] when omitted", () => {
    expect(createTagSchema.parse({ name: "Compliance" })).toEqual({
      name: "Compliance",
      categoryIds: [],
    });
  });

  it("rejects non-cuid entries in categoryIds", () => {
    expect(() =>
      createTagSchema.parse({ name: "Compliance", categoryIds: ["not-a-cuid"] }),
    ).toThrow();
  });

  it("dedupes categoryIds (two duplicates collapse to one)", () => {
    expect(
      createTagSchema.parse({ name: "Compliance", categoryIds: [CUID_A, CUID_A, CUID_B] }),
    ).toEqual({ name: "Compliance", categoryIds: [CUID_A, CUID_B] });
  });
});

describe("updateTagSchema", () => {
  it("accepts an empty body — both fields optional", () => {
    expect(updateTagSchema.parse({})).toEqual({});
  });

  it("preserves undefined categoryIds (do-not-touch) vs empty array (detach all)", () => {
    expect(updateTagSchema.parse({})).toEqual({});
    expect(updateTagSchema.parse({ categoryIds: [] })).toEqual({ categoryIds: [] });
  });

  it("dedupes categoryIds when supplied", () => {
    expect(updateTagSchema.parse({ categoryIds: [CUID_A, CUID_A] })).toEqual({
      categoryIds: [CUID_A],
    });
  });
});

describe("listTagsQuerySchema", () => {
  it("defaults to a sensible empty-state query", () => {
    expect(listTagsQuerySchema.parse({})).toEqual({
      q: "",
      sort: "name",
      order: "asc",
      page: 1,
      pageSize: 25,
      scope: "all",
    });
  });

  it("coerces string page/pageSize (URL params arrive as strings)", () => {
    const parsed = listTagsQuerySchema.parse({ page: "2", pageSize: "10" });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(10);
  });

  it("rejects out-of-range page and pageSize", () => {
    expect(() => listTagsQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => listTagsQuerySchema.parse({ pageSize: 0 })).toThrow();
    expect(() => listTagsQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it("rejects unknown sort and order enum values", () => {
    expect(() => listTagsQuerySchema.parse({ sort: "createdAt" })).toThrow();
    expect(() => listTagsQuerySchema.parse({ order: "ASC" })).toThrow();
  });

  it("trims the search query", () => {
    expect(listTagsQuerySchema.parse({ q: "  comp  " }).q).toBe("comp");
  });

  it("accepts a valid categoryId scoping", () => {
    expect(listTagsQuerySchema.parse({ categoryId: CUID_A }).categoryId).toBe(CUID_A);
  });

  it("rejects scope=uncategorized combined with categoryId", () => {
    expect(() =>
      listTagsQuerySchema.parse({ scope: "uncategorized", categoryId: CUID_A }),
    ).toThrow(/categoryId cannot be combined with scope=uncategorized/);
  });

  it("accepts scope=uncategorized without a categoryId", () => {
    const parsed = listTagsQuerySchema.parse({ scope: "uncategorized" });
    expect(parsed.scope).toBe("uncategorized");
    expect(parsed.categoryId).toBeUndefined();
  });
});

describe("replaceSurveyTagsSchema", () => {
  it("accepts an empty tagIds array (detach all)", () => {
    expect(replaceSurveyTagsSchema.parse({ tagIds: [] })).toEqual({ tagIds: [] });
  });

  it("accepts a list of cuids", () => {
    expect(replaceSurveyTagsSchema.parse({ tagIds: [CUID_A, CUID_B] })).toEqual({
      tagIds: [CUID_A, CUID_B],
    });
  });

  it("rejects duplicate tagIds", () => {
    expect(() => replaceSurveyTagsSchema.parse({ tagIds: [CUID_A, CUID_A] })).toThrow(
      /duplicate tag IDs/,
    );
  });

  it("rejects non-cuid entries", () => {
    expect(() => replaceSurveyTagsSchema.parse({ tagIds: ["not-a-cuid"] })).toThrow();
  });
});
