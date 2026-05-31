/**
 * Pure helpers for the survey-editor tag picker. Kept separate from
 * `src/lib/tags.ts` (which touches Prisma) so they're trivially
 * unit-testable without spinning up a DB.
 *
 * The picker envelope is `Array<{ category, tags }>` — one entry per
 * category followed by a final `category === null` entry for
 * uncategorized tags. A tag in two categories appears in both entries
 * by design; these helpers respect that and deduplicate where it
 * matters (counts, summaries) rather than mutating the structure.
 */

export type TagPickerGroup = {
  category: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
};

/**
 * Returns true if any group in the picker contains a tag with the
 * supplied id. A single truthy match is enough — a tag in two
 * categories appears in two groups, but only one needs to hit. Used
 * mainly in test coverage; the live component's checkbox state is
 * derived from `selectedTagIds.has(...)` directly.
 */
export function pickerHasTag(groups: TagPickerGroup[], tagId: string): boolean {
  for (const group of groups) {
    for (const tag of group.tags) {
      if (tag.id === tagId) return true;
    }
  }
  return false;
}

/**
 * Returns the deduplicated list of tag ids across every group, in the
 * iteration order they first appear. The same tag id appears twice
 * when it has memberships in two categories — this collapses those
 * into a single entry so the picker's "X tags available" indicators
 * stay accurate.
 */
export function uniqueTagIdsInGroups(groups: TagPickerGroup[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const tag of group.tags) {
      if (!seen.has(tag.id)) {
        seen.add(tag.id);
        out.push(tag.id);
      }
    }
  }
  return out;
}
