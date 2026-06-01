import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { instanceListQuerySchema } from "@/lib/validators";

/**
 * GET /api/super-admin/tasks/instances
 *
 * Cross-user TaskInstance list for the admin global instance overview
 * (U8 — R23, R24). `requireSuperAdmin()` first; the public-facing
 * `/api/tasks` endpoint is the unscoped per-user route, so this one is
 * the explicit cross-user surface.
 *
 * Filters compose with AND semantics:
 *   - `userId`     exact-match scope to one user
 *   - `taskId`     exact-match scope to one task definition
 *   - `status`     `pending` | `completed`
 *   - `cursor`     `<createdAtIso>_<id>` from a previous response
 *   - `limit`      [1, 100], default 50
 *
 * Cursor pagination is on the stable `(createdAt, id)` tuple so two
 * instances created in the same millisecond don't collide on the
 * boundary between pages. Ordering is `createdAt DESC, id DESC` so the
 * filter `WHERE (createdAt, id) < (cursorCreatedAt, cursorId)`
 * (expressed as Prisma's OR-with-tie-break) walks backwards in time
 * through the result set.
 *
 * Includes `user.email` + `user.name` + `task.title` so the admin
 * table can render every row without a second round-trip.
 */

const INSTANCE_SELECT = {
  id: true,
  taskId: true,
  userId: true,
  status: true,
  source: true,
  signature: true,
  completedAt: true,
  assignedByAdminId: true,
  completedByAdminId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true, name: true } },
  task: { select: { id: true, title: true } },
} as const;

/**
 * Decode the opaque `<createdAtIso>_<id>` cursor. Returns null on any
 * shape mismatch — the route maps that to a 400 so a tampered cursor
 * surfaces an error rather than silently being ignored and returning
 * page 1 again (which would loop forever for a client paginating
 * forward).
 */
function decodeCursor(
  raw: string | undefined,
): { createdAt: Date; id: string } | null | "invalid" {
  if (raw === undefined) return null;
  const idx = raw.indexOf("_");
  if (idx < 1 || idx === raw.length - 1) return "invalid";
  const isoPart = raw.slice(0, idx);
  const idPart = raw.slice(idx + 1);
  const createdAt = new Date(isoPart);
  if (Number.isNaN(createdAt.getTime())) return "invalid";
  return { createdAt, id: idPart };
}

export async function GET(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = instanceListQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { userId, taskId, status, cursor, limit } = parsed.data;

  const cursorDecoded = decodeCursor(cursor);
  if (cursorDecoded === "invalid") {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  // Build the WHERE clause. The cursor comparison expresses the
  // `(createdAt, id) < (cursorCreatedAt, cursorId)` tuple as the
  // standard OR-with-tie-break form Prisma supports natively (no raw
  // SQL needed).
  const whereParts: Array<Record<string, unknown>> = [];
  if (userId) whereParts.push({ userId });
  if (taskId) whereParts.push({ taskId });
  if (status) whereParts.push({ status });
  if (cursorDecoded) {
    whereParts.push({
      OR: [
        { createdAt: { lt: cursorDecoded.createdAt } },
        {
          AND: [
            { createdAt: cursorDecoded.createdAt },
            { id: { lt: cursorDecoded.id } },
          ],
        },
      ],
    });
  }

  // Fetch limit+1 so we can tell whether a next page exists without a
  // second count query.
  const rows = await prisma.taskInstance.findMany({
    where: whereParts.length > 0 ? { AND: whereParts } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: INSTANCE_SELECT,
  });

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext
    ? `${page[page.length - 1]!.createdAt.toISOString()}_${page[page.length - 1]!.id}`
    : null;

  return NextResponse.json({
    instances: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    })),
    nextCursor,
  });
}
