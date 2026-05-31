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
