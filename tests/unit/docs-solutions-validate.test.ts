import { describe, expect, it } from "vitest";

import {
  expectedCategory,
  parseFrontmatter,
  validateCorpus,
  validateDoc,
} from "@/lib/docs-solutions/validate";
import type { CorpusInput } from "@/lib/docs-solutions/validate";
import type { ParsedFrontmatter } from "@/lib/docs-solutions/types";

/**
 * Unit coverage for the docs-solutions validator. Each rule from R2/R3
 * has at least one positive and one negative scenario. The corpus-wide
 * Vitest test (`docs-solutions-coverage.test.ts`) runs the same
 * functions against real files; this file uses synthetic inputs so
 * the assertions stay focused on the rule rather than the corpus state.
 */

const VALID_PATH = "docs/solutions/architecture-patterns/example.md";

function valid(): ParsedFrontmatter {
  return {
    frontmatter: {
      title: "Example",
      date: "2026-05-31",
      category: "docs/solutions/architecture-patterns",
      module: "src/lib/example",
      problem_type: "architecture_pattern",
      id: "SOL-2026-099",
      status: "active",
      tags: ["nextjs"],
    },
    body: "# Example\n",
  };
}

// ─── parseFrontmatter ──────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses a valid frontmatter block", () => {
    const src = `---
title: Example
date: 2026-05-31
---

# Example
`;
    const result = parseFrontmatter(src);
    expect(result.error).toBeUndefined();
    expect(result.frontmatter).toEqual({ title: "Example", date: "2026-05-31" });
    expect(result.body.trim()).toBe("# Example");
  });

  it("returns null frontmatter when no opening --- present", () => {
    const src = "# Just a body\n\nNo frontmatter here.";
    const result = parseFrontmatter(src);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(src);
    expect(result.error).toBeUndefined();
  });

  it("returns an error when YAML is malformed", () => {
    const src = `---
title: Example
date: 2026-05-31
tags: [unclosed
---

body
`;
    const result = parseFrontmatter(src);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("handles CRLF line endings", () => {
    const src = "---\r\ntitle: Example\r\n---\r\n\r\nbody\r\n";
    const result = parseFrontmatter(src);
    expect(result.error).toBeUndefined();
    expect(result.frontmatter).toEqual({ title: "Example" });
  });

  it("rejects a frontmatter block that parses to an array (not a mapping)", () => {
    const src = `---
- one
- two
---

body
`;
    const result = parseFrontmatter(src);
    expect(result.frontmatter).toBeNull();
    expect(result.error).toMatch(/mapping/i);
  });
});

// ─── expectedCategory ──────────────────────────────────────────────────────

describe("expectedCategory", () => {
  it("derives the category from a docs/solutions path", () => {
    expect(expectedCategory("docs/solutions/architecture-patterns/foo.md")).toBe(
      "docs/solutions/architecture-patterns",
    );
  });

  it("returns null for paths outside docs/solutions", () => {
    expect(expectedCategory("src/lib/foo.ts")).toBeNull();
    expect(expectedCategory("docs/brainstorms/foo.md")).toBeNull();
  });

  it("returns null for paths too short to carry a category dir", () => {
    expect(expectedCategory("docs/solutions/foo.md")).toBeNull();
  });
});

// ─── validateDoc — required fields ─────────────────────────────────────────

describe("validateDoc — required fields", () => {
  const allIds = new Set(["SOL-2026-099"]);

  it("passes a fully-formed doc", () => {
    const { errors } = validateDoc(valid(), VALID_PATH, allIds);
    expect(errors).toEqual([]);
  });

  it("flags each missing required field with the field name in the message", () => {
    const required = ["title", "date", "category", "module", "problem_type", "id", "status"];
    for (const field of required) {
      const parsed = valid();
      delete (parsed.frontmatter as Record<string, unknown>)[field];
      const { errors } = validateDoc(parsed, VALID_PATH, allIds);
      const match = errors.find((e) => e.field === field);
      expect(match, `expected an error for missing ${field}`).toBeDefined();
      expect(match!.message).toContain(field);
    }
  });

  it("does NOT require `severity` (per F-001 resolution)", () => {
    const parsed = valid();
    delete (parsed.frontmatter as Record<string, unknown>).severity;
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.filter((e) => e.field === "severity")).toEqual([]);
  });
});

// ─── validateDoc — enum + format checks ────────────────────────────────────

describe("validateDoc — enum and format checks", () => {
  const allIds = new Set(["SOL-2026-099", "SOL-2026-100"]);

  it("rejects an unknown problem_type", () => {
    const parsed = valid();
    parsed.frontmatter!.problem_type = "not_a_real_type";
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.find((e) => e.field === "problem_type")?.message).toContain("not_a_real_type");
  });

  it.each([
    ["SOL-26-1", "wrong year width"],
    ["XSOL-2026-001", "wrong prefix"],
    ["SOL-2026-1", "wrong sequence width"],
    ["sol-2026-001", "lowercase prefix"],
  ])("rejects malformed id %s (%s)", (badId) => {
    const parsed = valid();
    parsed.frontmatter!.id = badId;
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.find((e) => e.field === "id")?.message).toContain(badId);
  });

  it("rejects an unknown status", () => {
    const parsed = valid();
    parsed.frontmatter!.status = "dormant";
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.find((e) => e.field === "status")?.message).toContain("dormant");
  });

  it("rejects a category that does not match the file's directory", () => {
    const parsed = valid();
    parsed.frontmatter!.category = "docs/solutions/runtime-errors";
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    const match = errors.find((e) => e.field === "category");
    expect(match?.message).toContain("docs/solutions/runtime-errors");
    expect(match?.message).toContain("docs/solutions/architecture-patterns");
  });

  it("accepts the full docs/solutions/<dir> category prefix (F-002 resolution)", () => {
    // The existing corpus stores category: docs/solutions/<dir>; this confirms
    // the validator compares against the full prefix, not just the dir name.
    const parsed = valid();
    parsed.frontmatter!.category = "docs/solutions/architecture-patterns";
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.filter((e) => e.field === "category")).toEqual([]);
  });
});

// ─── validateDoc — tag strict-binary (KTD4) ────────────────────────────────

describe("validateDoc — tags (strict-binary per KTD4)", () => {
  const allIds = new Set(["SOL-2026-099"]);

  it("rejects any tag not in KNOWN_TAGS", () => {
    const parsed = valid();
    parsed.frontmatter!.tags = ["nextjs", "some-tag-not-in-catalog"];
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    const match = errors.find((e) => e.field === "tags");
    expect(match?.message).toContain("some-tag-not-in-catalog");
    expect(match?.message).toContain("KNOWN_TAGS");
  });

  it("accepts tags that are all registered", () => {
    const parsed = valid();
    parsed.frontmatter!.tags = ["nextjs", "openapi", "zod"];
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.filter((e) => e.field === "tags")).toEqual([]);
  });
});

// ─── validateDoc — supersedes / superseded_by ──────────────────────────────

describe("validateDoc — supersedes references", () => {
  const allIds = new Set(["SOL-2026-001", "SOL-2026-099"]);

  it("rejects supersedes targeting an unknown id", () => {
    const parsed = valid();
    parsed.frontmatter!.supersedes = ["SOL-2026-999"];
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    const match = errors.find((e) => e.field === "supersedes");
    expect(match?.message).toContain("SOL-2026-999");
  });

  it("rejects superseded_by targeting an unknown id", () => {
    const parsed = valid();
    parsed.frontmatter!.superseded_by = "SOL-2026-999";
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    const match = errors.find((e) => e.field === "superseded_by");
    expect(match?.message).toContain("SOL-2026-999");
  });

  it("accepts supersedes targeting a known id", () => {
    const parsed = valid();
    parsed.frontmatter!.supersedes = ["SOL-2026-001"];
    const { errors } = validateDoc(parsed, VALID_PATH, allIds);
    expect(errors.filter((e) => e.field === "supersedes")).toEqual([]);
  });
});

// ─── validateCorpus ────────────────────────────────────────────────────────

function corpusInput(path: string, frontmatter: Record<string, unknown>): CorpusInput {
  return { path, parsed: { frontmatter, body: "" } };
}

describe("validateCorpus", () => {
  it("detects duplicate ids across docs", () => {
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", { id: "SOL-2026-005" }),
      corpusInput("docs/solutions/a/y.md", { id: "SOL-2026-005" }),
    ];
    const { errors } = validateCorpus(docs);
    const match = errors.find((e) => e.field === "id");
    expect(match?.message).toContain("SOL-2026-005");
    expect(match?.message).toContain("docs/solutions/a/x.md");
    expect(match?.message).toContain("docs/solutions/a/y.md");
  });

  it("detects a 2-cycle in the supersedes graph", () => {
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", {
        id: "SOL-2026-005",
        superseded_by: "SOL-2026-008",
        supersedes: ["SOL-2026-008"],
      }),
      corpusInput("docs/solutions/a/y.md", {
        id: "SOL-2026-008",
        superseded_by: "SOL-2026-005",
        supersedes: ["SOL-2026-005"],
      }),
    ];
    const { errors } = validateCorpus(docs);
    const cycleErr = errors.find((e) =>
      e.message.includes("cycle") || e.message.includes("→"),
    );
    expect(cycleErr).toBeDefined();
  });

  it("flags status: superseded with no claimant", () => {
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", {
        id: "SOL-2026-005",
        status: "superseded",
      }),
    ];
    const { errors } = validateCorpus(docs);
    const match = errors.find((e) => e.field === "status");
    expect(match?.message).toContain("superseded");
    expect(match?.message).toContain("SOL-2026-005");
  });

  it("flags supersedes ↔ superseded_by mutual inconsistency", () => {
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", {
        id: "SOL-2026-005",
        superseded_by: "SOL-2026-008",
      }),
      corpusInput("docs/solutions/a/y.md", {
        id: "SOL-2026-008",
        // Missing supersedes: ["SOL-2026-005"]
        supersedes: [],
        // To avoid orphan-superseded error on x, give y a claimant link.
      }),
    ];
    const { errors } = validateCorpus(docs);
    expect(errors.find((e) => e.field === "superseded_by")?.message).toMatch(/does not list/);
  });

  it("emits warning when a KNOWN_TAGS entry is unused and not reserved", () => {
    // A 'nextjs' tag exists but no doc uses it here; expect a warning. Use
    // the quoted form `'nextjs'` so the assertion does not also match
    // `'nextjs-route-handler'`.
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", {
        id: "SOL-2026-001",
        tags: [],
      }),
    ];
    const { warnings } = validateCorpus(docs);
    expect(warnings.some((w) => w.field === "tags" && w.message.includes("'nextjs'"))).toBe(true);
  });

  it("respects reservedTags option to silence orphan-tag warning", () => {
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", {
        id: "SOL-2026-001",
        tags: [],
      }),
    ];
    const { warnings } = validateCorpus(docs, { reservedTags: new Set(["nextjs"]) });
    expect(warnings.some((w) => w.field === "tags" && w.message.includes("'nextjs'"))).toBe(false);
  });

  it("emits warning when a KNOWN_PROBLEM_TYPES entry is unused and not reserved", () => {
    const docs: CorpusInput[] = [
      corpusInput("docs/solutions/a/x.md", {
        id: "SOL-2026-001",
        problem_type: "architecture_pattern",
      }),
    ];
    const { warnings } = validateCorpus(docs);
    // 'logic_error' is registered but not used here and not reserved by default.
    expect(warnings.some((w) => w.field === "problem_type" && w.message.includes("logic_error"))).toBe(true);
  });
});
