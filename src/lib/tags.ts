import { cache } from "react";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type {
  CreateTagInput,
  ListTagsQuery,
  UpdateTagInput,
} from "@/lib/validators";

/**
 * Detail shape returned for a single tag — what the API serialises and
 * what `listTagsPage` items use. `categories` is flattened from the
 * `TagCategoryAssignment` rows; `usageCount` is mapped from
 * `_count.surveyAttachments`.
 */
export type TagDetail = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  categories: Array<{ id: string; name: string }>;
  usageCount: number;
};

/**
 * Thrown by `deleteTagIfUnused` when the tag is still attached to one
 * or more surveys. Handlers map this to 409 with the survey count so
 * the UI can say "remove it from N surveys first". The `Restrict` FK
 * on `SurveyTag.tagId` is the DB-level safety net; this is the primary
 * mechanism so we can return a friendly count.
 */
export class TagInUseError extends Error {
  public readonly surveyCount: number;
  constructor(surveyCount: number) {
    super(`Tag is attached to ${surveyCount} survey(s)`);
    this.name = "TagInUseError";
    this.surveyCount = surveyCount;
  }
}

/**
 * Build the `WHERE` clause for the paginated tags list from a parsed
 * `ListTagsQuery`. Cases:
 *   - `q` non-empty → `nameLower: { contains: q.toLowerCase() }`.
 *     SQLite (the repo default) does not support Prisma's
 *     `mode: "insensitive"`, so we filter against the shadow column
 *     and lower-case the query ourselves.
 *   - `categoryId` set → membership in that category.
 *   - `scope === "uncategorized"` → no category memberships at all.
 *   - When multiple apply, compose by AND (Prisma's default for the
 *     same-object keys).
 */
export function buildTagsListWhere(query: ListTagsQuery): Prisma.TagWhereInput {
  const where: Prisma.TagWhereInput = {};
  const q = query.q.trim();
  if (q.length > 0) {
    where.nameLower = { contains: q.toLowerCase() };
  }
  if (query.scope === "uncategorized") {
    where.assignments = { none: {} };
  } else if (query.categoryId) {
    where.assignments = { some: { categoryId: query.categoryId } };
  }
  return where;
}

/**
 * Build the `ORDER BY` clause from a parsed `ListTagsQuery`.
 * `sort=name` → `{ name: order }`; `sort=usage` uses Prisma's
 * relation-count orderBy (`{ surveyAttachments: { _count: order } }`,
 * Prisma 5.7+; repo is on 5.22).
 */
export function buildTagsListOrderBy(
  query: ListTagsQuery,
): Prisma.TagOrderByWithRelationInput {
  if (query.sort === "usage") {
    return { surveyAttachments: { _count: query.order } };
  }
  return { name: query.order };
}

const TAG_DETAIL_INCLUDE = {
  assignments: {
    include: {
      category: { select: { id: true, name: true } },
    },
  },
  _count: { select: { surveyAttachments: true } },
} satisfies Prisma.TagInclude;

type TagRow = Prisma.TagGetPayload<{ include: typeof TAG_DETAIL_INCLUDE }>;

function toTagDetail(row: TagRow): TagDetail {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    categories: row.assignments.map((a) => ({
      id: a.category.id,
      name: a.category.name,
    })),
    usageCount: row._count.surveyAttachments,
  };
}

/**
 * Internal: re-fetch a tag in the canonical detail shape after a
 * create/update so handlers return the same shape `listTagsPage`
 * produces.
 */
async function getTagDetail(id: string): Promise<TagDetail> {
  const row = await prisma.tag.findUniqueOrThrow({
    where: { id },
    include: TAG_DETAIL_INCLUDE,
  });
  return toTagDetail(row);
}

/**
 * Run the paginated list query: a `findMany + count` transaction.
 * Returns the conventional `{ items, total, page, pageSize }` envelope
 * — first server-paginated endpoint in the repo and the pattern future
 * paginated admin lists will copy.
 */
export async function listTagsPage(query: ListTagsQuery): Promise<{
  items: TagDetail[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where = buildTagsListWhere(query);
  const orderBy = buildTagsListOrderBy(query);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await prisma.$transaction([
    prisma.tag.findMany({
      where,
      orderBy,
      skip,
      take: query.pageSize,
      include: TAG_DETAIL_INCLUDE,
    }),
    prisma.tag.count({ where }),
  ]);

  return {
    items: rows.map(toTagDetail),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Create a tag with optional category memberships. Transactional so a
 * failure on the category assignments doesn't leave a dangling tag
 * row. Returns the new tag in the canonical detail shape. `nameLower`
 * is populated from the (DB-normaliser-trimmed) name so the
 * case-insensitive `@unique` is effective on SQLite.
 */
export async function createTag(input: CreateTagInput): Promise<TagDetail> {
  const name = input.name.trim();
  const tag = await prisma.$transaction(async (tx) => {
    const created = await tx.tag.create({
      data: {
        name,
        nameLower: name.toLowerCase(),
      },
    });
    if (input.categoryIds.length > 0) {
      await tx.tagCategoryAssignment.createMany({
        data: input.categoryIds.map((categoryId) => ({
          tagId: created.id,
          categoryId,
        })),
      });
    }
    return created;
  });
  return getTagDetail(tag.id);
}

/**
 * Update a tag's name and/or category memberships. When
 * `categoryIds` is supplied it REPLACES the current set (per the
 * validator's documented contract) — we `deleteMany` all existing
 * assignment rows then `createMany` the new ones in a transaction.
 * Last-writer-wins; no `updatedAt` precondition check (matches the
 * existing survey-step reorder convention).
 */
export async function updateTag(
  id: string,
  input: UpdateTagInput,
): Promise<TagDetail> {
  await prisma.$transaction(async (tx) => {
    if (input.name !== undefined) {
      const name = input.name.trim();
      await tx.tag.update({
        where: { id },
        data: {
          name,
          nameLower: name.toLowerCase(),
        },
      });
    }
    if (input.categoryIds !== undefined) {
      await tx.tagCategoryAssignment.deleteMany({ where: { tagId: id } });
      if (input.categoryIds.length > 0) {
        await tx.tagCategoryAssignment.createMany({
          data: input.categoryIds.map((categoryId) => ({
            tagId: id,
            categoryId,
          })),
        });
      }
    }
  });
  return getTagDetail(id);
}

/**
 * Delete a tag if it isn't attached to any survey. Reads the usage
 * count first; if > 0 throws `TagInUseError` carrying the count so the
 * handler can return 409 with a friendly message. On success the
 * cascade on `TagCategoryAssignment` removes the membership rows
 * automatically. Lets Prisma `P2025` propagate for the not-found case.
 */
export async function deleteTagIfUnused(id: string): Promise<void> {
  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { _count: { select: { surveyAttachments: true } } },
  });
  if (!tag) {
    // Throw the same shape Prisma would have raised on a missing-row
    // delete so the handler's existing P2025 mapping fires uniformly.
    throw new Prisma.PrismaClientKnownRequestError(
      `No Tag found with id ${id}`,
      { code: "P2025", clientVersion: Prisma.prismaVersion.client },
    );
  }
  const count = tag._count.surveyAttachments;
  if (count > 0) {
    throw new TagInUseError(count);
  }
  await prisma.tag.delete({ where: { id } });
}

/**
 * Thrown by `replaceSurveyTags` when one or more of the supplied tag
 * IDs isn't in the catalog. Carries the offending IDs so the handler
 * can return a 400 body listing them. The same shape is used as a
 * backstop when Prisma raises `P2003` mid-transaction (a tag deleted
 * after the in-transaction existence check but before commit).
 */
export class UnknownTagIdsError extends Error {
  public readonly unknown: string[];
  constructor(unknown: string[]) {
    super(`Unknown tag IDs: ${unknown.join(", ")}`);
    this.name = "UnknownTagIdsError";
    this.unknown = unknown;
  }
}

/**
 * Pure helper for the unknown-ID rejection logic — splits `requested`
 * into the subset present in `knownIds` (`toApply`) and the rest
 * (`unknown`). Preserves the original order of `requested` in both
 * partitions so the picker's "X selected" indicator stays stable.
 */
export function partitionReplaceTagIds(
  requested: string[],
  knownIds: Set<string>,
): { toApply: string[]; unknown: string[] } {
  const toApply: string[] = [];
  const unknown: string[] = [];
  for (const id of requested) {
    if (knownIds.has(id)) {
      toApply.push(id);
    } else {
      unknown.push(id);
    }
  }
  return { toApply, unknown };
}

/**
 * Return every tag ID currently attached to a survey. Used by the
 * survey-editor page-level fetch so the picker can render checked
 * boxes for the existing attachments.
 */
export async function getSurveyTagIds(surveyId: string): Promise<string[]> {
  const rows = await prisma.surveyTag.findMany({
    where: { surveyId },
    select: { tagId: true },
  });
  return rows.map((r) => r.tagId);
}

/**
 * Shape consumed by the survey-editor tag picker (U7) — one entry per
 * category (alpha) followed by a final `category === null` entry for
 * uncategorized tags. A tag in two categories appears in both entries
 * intentionally; the picker UI keeps a single underlying state per
 * tag ID so toggling either checkbox updates both.
 */
export type PickerGroup = {
  category: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
};

/**
 * Fetch the catalog in the picker-grouped envelope. Wrapped in
 * `react.cache` (per SOL-2026-003) so a future surface that renders
 * many surveys on the same request — e.g. a list of surveys each with
 * their tag chips — fans out at most once.
 *
 * The uncategorized entry is always appended, even when empty; the UI
 * decides whether to render it.
 */
export const listTagsForPicker = cache(async (): Promise<PickerGroup[]> => {
  const categories = await prisma.tagCategory.findMany({
    orderBy: { name: "asc" },
    include: {
      assignments: {
        include: { tag: { select: { id: true, name: true } } },
        orderBy: { tag: { name: "asc" } },
      },
    },
  });

  const uncategorized = await prisma.tag.findMany({
    where: { assignments: { none: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const groups: PickerGroup[] = categories.map((c) => ({
    category: { id: c.id, name: c.name },
    tags: c.assignments.map((a) => ({ id: a.tag.id, name: a.tag.name })),
  }));
  groups.push({ category: null, tags: uncategorized });
  return groups;
});

/**
 * Bulk-replace the tag set on a survey. Runs the unknown-IDs check
 * INSIDE the same interactive transaction as the writes so a tag
 * deleted between the check and the createMany surfaces as an
 * `UnknownTagIdsError` rather than slipping through. Empty
 * `requestedTagIds` is the "detach all tags" case — the deleteMany
 * still fires, the createMany is skipped.
 *
 * The `Cascade` FK on `SurveyTag.surveyId` means a missing survey
 * surfaces as Prisma `P2003` on the createMany; handlers map that to
 * the same `unknown_tag_ids` 400 shape as the safe default. We don't
 * pre-check the survey exists — last-writer-wins is fine here.
 */
export async function replaceSurveyTags(
  surveyId: string,
  requestedTagIds: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    let toApply: string[] = [];
    if (requestedTagIds.length > 0) {
      const known = await tx.tag.findMany({
        where: { id: { in: requestedTagIds } },
        select: { id: true },
      });
      const knownIds = new Set(known.map((t) => t.id));
      const partitioned = partitionReplaceTagIds(requestedTagIds, knownIds);
      if (partitioned.unknown.length > 0) {
        throw new UnknownTagIdsError(partitioned.unknown);
      }
      toApply = partitioned.toApply;
    }

    await tx.surveyTag.deleteMany({ where: { surveyId } });
    if (toApply.length > 0) {
      await tx.surveyTag.createMany({
        data: toApply.map((tagId) => ({ surveyId, tagId })),
      });
    }
  });
}
