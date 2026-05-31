import { describe, expect, it } from "vitest";

import {
  buildTagsListOrderBy,
  buildTagsListWhere,
  TagInUseError,
} from "@/lib/tags";
import { listTagsQuerySchema } from "@/lib/validators";

/**
 * Helper to construct a realistic `ListTagsQuery` for the helpers
 * under test — runs through the validator so defaults and coercion
 * match the live route's behaviour.
 */
function makeQuery(overrides: Record<string, unknown> = {}) {
  return listTagsQuerySchema.parse(overrides);
}

describe("buildTagsListWhere", () => {
  it("returns an empty WHERE for the default query", () => {
    expect(buildTagsListWhere(makeQuery())).toEqual({});
  });

  it("filters by lowercased name when q is non-empty", () => {
    const where = buildTagsListWhere(makeQuery({ q: "comp" }));
    expect(where).toEqual({ nameLower: { contains: "comp" } });
  });

  it("case-folds the query to lower-case (the shadow column is lower)", () => {
    const where = buildTagsListWhere(makeQuery({ q: "COMP" }));
    expect(where).toEqual({ nameLower: { contains: "comp" } });
  });

  it("scope=uncategorized filters to tags with no category memberships", () => {
    const where = buildTagsListWhere(makeQuery({ scope: "uncategorized" }));
    expect(where).toEqual({ assignments: { none: {} } });
  });

  it("categoryId filters to tags that have a membership in that category", () => {
    // 25-char cuid-shaped id so the validator accepts it.
    const categoryId = "ck1234567890123456789abcd";
    const where = buildTagsListWhere(makeQuery({ categoryId }));
    expect(where).toEqual({ assignments: { some: { categoryId } } });
  });

  it("composes q and categoryId together (Prisma ANDs same-object keys)", () => {
    const categoryId = "ck1234567890123456789abcd";
    const where = buildTagsListWhere(makeQuery({ q: "comp", categoryId }));
    expect(where).toEqual({
      nameLower: { contains: "comp" },
      assignments: { some: { categoryId } },
    });
  });
});

describe("buildTagsListOrderBy", () => {
  it("sorts by name ascending by default", () => {
    expect(buildTagsListOrderBy(makeQuery())).toEqual({ name: "asc" });
  });

  it("sorts by name with the requested order", () => {
    expect(buildTagsListOrderBy(makeQuery({ sort: "name", order: "desc" }))).toEqual({
      name: "desc",
    });
  });

  it("sorts by usage via the surveyAttachments relation _count", () => {
    expect(
      buildTagsListOrderBy(makeQuery({ sort: "usage", order: "desc" })),
    ).toEqual({ surveyAttachments: { _count: "desc" } });
  });

  it("sorts by usage ascending when asked", () => {
    expect(
      buildTagsListOrderBy(makeQuery({ sort: "usage", order: "asc" })),
    ).toEqual({ surveyAttachments: { _count: "asc" } });
  });
});

describe("TagInUseError", () => {
  it("carries the surveyCount it was constructed with", () => {
    expect(new TagInUseError(3).surveyCount).toBe(3);
  });

  it("has a stable name for instanceof + name-tag-based checks", () => {
    const e = new TagInUseError(1);
    expect(e.name).toBe("TagInUseError");
  });

  it("is an instance of TagInUseError and Error", () => {
    const e = new TagInUseError(2);
    expect(e instanceof TagInUseError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });
});
