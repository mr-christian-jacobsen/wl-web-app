import { cache } from "react";
import type { TagCategory } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { CreateCategoryInput, UpdateCategoryInput } from "@/lib/validators";

/**
 * Row shape returned by `listCategoriesWithCount` — the Prisma row plus
 * the `_count.assignments` relation count. The API handler maps
 * `_count.assignments` to `tagCount` before serialising to clients so
 * Prisma terminology stays inside the helper.
 */
export type CategoryWithCount = TagCategory & {
  _count: { assignments: number };
};

/**
 * List every tag category alphabetically by name, including a count of
 * tag↔category membership rows per category. Wrapped in `react.cache`
 * (per SOL-2026-003) so a single render pass that touches the catalog
 * from multiple places — server page + side panels, etc. — only issues
 * one query.
 *
 * Callers that need the user-facing `tagCount` shape should map
 * `_count.assignments` themselves; this helper keeps the Prisma name to
 * avoid lying about the source.
 */
export const listCategoriesWithCount = cache(async (): Promise<CategoryWithCount[]> => {
  return prisma.tagCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true } } },
  });
});

/**
 * Pure helper for the in-process duplicate-name pre-check before
 * insert. The DB `@unique` on `nameLower` is the authoritative guard;
 * this exists so callers and unit tests can express the "are these the
 * same category by name?" question without touching Prisma. Trims and
 * lowercases both sides, matching how `nameLower` is computed on write.
 */
export function categoriesEqualByNameCi(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Create a category. Populates the `nameLower` shadow column from the
 * (DB-normaliser-trimmed) `name` so the case-insensitive `@unique`
 * constraint is effective on SQLite. The DB-write extension in
 * `src/lib/db.ts` trims `name`; we replicate the trim here for
 * `nameLower` since it isn't on the normaliser's field list.
 */
export async function createCategory(input: CreateCategoryInput): Promise<TagCategory> {
  const name = input.name.trim();
  return prisma.tagCategory.create({
    data: {
      name,
      nameLower: name.toLowerCase(),
      description: input.description,
    },
  });
}

/**
 * Update a category. When `name` is supplied we also rewrite
 * `nameLower` so the case-insensitive `@unique` stays consistent.
 * Omitted fields are left untouched; passing `description: undefined`
 * is a no-op (Prisma ignores undefined keys in partial updates).
 */
export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<TagCategory> {
  const data: { name?: string; nameLower?: string; description?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    data.name = name;
    data.nameLower = name.toLowerCase();
  }
  if (input.description !== undefined) {
    data.description = input.description;
  }
  return prisma.tagCategory.update({
    where: { id },
    data,
  });
}

/**
 * Delete a category. The cascade on `TagCategoryAssignment` removes
 * tag↔category membership rows automatically; tags themselves survive
 * and surface under the synthetic "Uncategorized" scope in the catalog
 * sidebar (see U6).
 */
export async function deleteCategory(id: string): Promise<TagCategory> {
  return prisma.tagCategory.delete({ where: { id } });
}
