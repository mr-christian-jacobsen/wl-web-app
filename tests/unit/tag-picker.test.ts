import { describe, expect, it } from "vitest";

import {
  pickerHasTag,
  uniqueTagIdsInGroups,
  type TagPickerGroup,
} from "@/lib/tag-picker";

describe("pickerHasTag", () => {
  it("returns true when the tag is present in a category group", () => {
    const groups: TagPickerGroup[] = [
      { category: { id: "c1", name: "A" }, tags: [{ id: "t1", name: "X" }] },
      { category: null, tags: [] },
    ];
    expect(pickerHasTag(groups, "t1")).toBe(true);
  });

  it("returns false when no group contains the tag", () => {
    const groups: TagPickerGroup[] = [
      { category: { id: "c1", name: "A" }, tags: [{ id: "t1", name: "X" }] },
      { category: null, tags: [{ id: "t2", name: "Y" }] },
    ];
    expect(pickerHasTag(groups, "missing")).toBe(false);
  });

  it("returns true when the tag appears in two different category groups", () => {
    const groups: TagPickerGroup[] = [
      { category: { id: "c1", name: "A" }, tags: [{ id: "t1", name: "X" }] },
      { category: { id: "c2", name: "B" }, tags: [{ id: "t1", name: "X" }] },
      { category: null, tags: [] },
    ];
    expect(pickerHasTag(groups, "t1")).toBe(true);
  });

  it("returns true when the tag is in the uncategorized group", () => {
    const groups: TagPickerGroup[] = [
      { category: { id: "c1", name: "A" }, tags: [] },
      { category: null, tags: [{ id: "t9", name: "Loose" }] },
    ];
    expect(pickerHasTag(groups, "t9")).toBe(true);
  });

  it("returns false on an empty groups array", () => {
    expect(pickerHasTag([], "t1")).toBe(false);
  });
});

describe("uniqueTagIdsInGroups", () => {
  it("returns [] for empty groups", () => {
    expect(uniqueTagIdsInGroups([])).toEqual([]);
  });

  it("returns every tag id when there are no duplicates across groups", () => {
    const groups: TagPickerGroup[] = [
      {
        category: { id: "c1", name: "A" },
        tags: [
          { id: "t1", name: "X" },
          { id: "t2", name: "Y" },
        ],
      },
      { category: { id: "c2", name: "B" }, tags: [{ id: "t3", name: "Z" }] },
      { category: null, tags: [{ id: "t4", name: "Loose" }] },
    ];
    expect(uniqueTagIdsInGroups(groups)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("deduplicates a tag that appears in two category groups", () => {
    const groups: TagPickerGroup[] = [
      {
        category: { id: "c1", name: "A" },
        tags: [
          { id: "t1", name: "X" },
          { id: "t2", name: "Y" },
        ],
      },
      {
        category: { id: "c2", name: "B" },
        tags: [
          { id: "t1", name: "X" },
          { id: "t3", name: "Z" },
        ],
      },
      { category: null, tags: [{ id: "t4", name: "Loose" }] },
    ];
    const ids = uniqueTagIdsInGroups(groups);
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("preserves first-seen iteration order across groups", () => {
    const groups: TagPickerGroup[] = [
      { category: { id: "c1", name: "A" }, tags: [{ id: "t2", name: "Y" }] },
      { category: { id: "c2", name: "B" }, tags: [{ id: "t1", name: "X" }] },
      { category: null, tags: [{ id: "t2", name: "Y" }] },
    ];
    expect(uniqueTagIdsInGroups(groups)).toEqual(["t2", "t1"]);
  });
});
