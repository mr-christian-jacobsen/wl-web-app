import { describe, expect, it } from "vitest";

import {
  buildTagsPageHref,
  parseTagsPageSearchParams,
} from "@/lib/tags-page-url";
import type { ListTagsQuery } from "@/lib/validators";

const CUID_A = "ckxxxxxxxxxxxxxxxxxxxxxxxx";

describe("parseTagsPageSearchParams", () => {
  it("returns full schema defaults for an empty object", () => {
    expect(parseTagsPageSearchParams({})).toEqual({
      q: "",
      sort: "name",
      order: "asc",
      page: 1,
      pageSize: 25,
      scope: "all",
    });
  });

  it("returns full schema defaults for an empty URLSearchParams", () => {
    expect(parseTagsPageSearchParams(new URLSearchParams())).toEqual({
      q: "",
      sort: "name",
      order: "asc",
      page: 1,
      pageSize: 25,
      scope: "all",
    });
  });

  it("coerces page/pageSize from strings and respects sort+order", () => {
    expect(
      parseTagsPageSearchParams({ page: "2", sort: "usage", order: "desc" }),
    ).toEqual({
      q: "",
      sort: "usage",
      order: "desc",
      page: 2,
      pageSize: 25,
      scope: "all",
    });
  });

  it("parses scope=uncategorized with no categoryId", () => {
    const parsed = parseTagsPageSearchParams({ scope: "uncategorized" });
    expect(parsed.scope).toBe("uncategorized");
    expect(parsed.categoryId).toBeUndefined();
  });

  it("falls back to defaults on a malformed URL instead of throwing", () => {
    // pageSize=999 violates the schema's max=100; parse should not throw —
    // a bad URL must never crash the page.
    const parsed = parseTagsPageSearchParams({ pageSize: "999" });
    expect(parsed.pageSize).toBe(25);
    expect(parsed.page).toBe(1);
  });

  it("flattens array search params (Next.js can hand repeats)", () => {
    expect(
      parseTagsPageSearchParams({ q: ["first", "second"], sort: "usage" }).q,
    ).toBe("first");
  });

  it("accepts URLSearchParams directly", () => {
    const params = new URLSearchParams("page=3&sort=usage&order=desc");
    const parsed = parseTagsPageSearchParams(params);
    expect(parsed.page).toBe(3);
    expect(parsed.sort).toBe("usage");
    expect(parsed.order).toBe("desc");
  });
});

describe("buildTagsPageHref", () => {
  it("returns the bare path when every field is at its default", () => {
    expect(buildTagsPageHref({})).toBe("/super-admin/tags");
    expect(
      buildTagsPageHref({
        page: 1,
        pageSize: 25,
        sort: "name",
        order: "asc",
        q: "",
        scope: "all",
      }),
    ).toBe("/super-admin/tags");
  });

  it("emits only non-default sort/order/page params", () => {
    expect(
      buildTagsPageHref({ sort: "usage", order: "desc", page: 2 }),
    ).toBe("/super-admin/tags?sort=usage&order=desc&page=2");
  });

  it("includes q and categoryId when set", () => {
    const href = buildTagsPageHref({ q: "comp", categoryId: CUID_A });
    expect(href).toContain("q=comp");
    expect(href).toContain(`categoryId=${CUID_A}`);
  });

  it("includes scope=uncategorized but omits scope=all", () => {
    expect(buildTagsPageHref({ scope: "uncategorized" })).toBe(
      "/super-admin/tags?scope=uncategorized",
    );
    expect(buildTagsPageHref({ scope: "all" })).toBe("/super-admin/tags");
  });

  it("emits pageSize when it differs from the default", () => {
    expect(buildTagsPageHref({ pageSize: 10 })).toBe(
      "/super-admin/tags?pageSize=10",
    );
  });
});

describe("buildTagsPageHref + parseTagsPageSearchParams round-trip", () => {
  // Each input is a non-default query. After we serialise then re-parse,
  // the resulting query must deep-equal the original (with the schema's
  // own defaults filled in for any field the original omitted).
  const cases: Array<{ name: string; query: Partial<ListTagsQuery> }> = [
    {
      name: "sort + order + page",
      query: { sort: "usage", order: "desc", page: 2 },
    },
    {
      name: "q + categoryId",
      query: { q: "comp", categoryId: CUID_A },
    },
    {
      name: "scope=uncategorized",
      query: { scope: "uncategorized" },
    },
    {
      name: "pageSize override",
      query: { pageSize: 10, page: 3 },
    },
    {
      name: "all the things",
      query: {
        q: "lead",
        sort: "usage",
        order: "desc",
        page: 4,
        pageSize: 50,
        categoryId: CUID_A,
      },
    },
  ];

  for (const c of cases) {
    it(`round-trips: ${c.name}`, () => {
      const href = buildTagsPageHref(c.query);
      const qs = href.split("?")[1] ?? "";
      const parsed = parseTagsPageSearchParams(new URLSearchParams(qs));
      // Every field in the original should equal its parsed counterpart.
      for (const [k, v] of Object.entries(c.query)) {
        expect(parsed[k as keyof typeof parsed]).toBe(v);
      }
    });
  }
});
