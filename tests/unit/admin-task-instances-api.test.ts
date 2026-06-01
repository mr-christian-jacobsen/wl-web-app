import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Handler tests for the U8 admin instance overview endpoints.
 *
 *   GET   /api/super-admin/tasks/instances
 *   POST  /api/super-admin/tasks/instances/{id}/complete
 *
 * Coverage:
 *   - `requireSuperAdmin()` guard short-circuits on both routes.
 *   - GET: validates query (rejects unknown status), filters compose,
 *     cursor pagination returns rows older than the cursor, and an
 *     extra row is fetched to populate `nextCursor`.
 *   - POST complete: pending → 200 with status/source/completedAt and
 *     `completedByAdminId` set; already-completed → 409; unknown id
 *     → 404.
 *
 * Mocks: `@/lib/super-admin` and `@/lib/db` so the assertions stay
 * focused on the handler behavior (no Prisma round-trips, no real
 * session lookup).
 */

vi.mock("@/lib/super-admin", () => ({
  requireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    taskInstance: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { GET as listInstances } from "@/app/api/super-admin/tasks/instances/route";
import { POST as completeInstance } from "@/app/api/super-admin/tasks/instances/[id]/complete/route";

const guardMock = requireSuperAdmin as unknown as ReturnType<typeof vi.fn>;
const prismaMock = prisma as unknown as {
  taskInstance: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const FORBIDDEN_RESPONSE = NextResponse.json({ error: "Forbidden" }, { status: 403 });
const UNAUTHORIZED_RESPONSE = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  guardMock.mockReset();
  prismaMock.taskInstance.findMany.mockReset();
  prismaMock.taskInstance.findUnique.mockReset();
  prismaMock.taskInstance.update.mockReset();
});

// Minimal row shape that matches the handler's `select`. We don't
// include every column — `findMany` is mocked so the runtime values
// only matter for the assertions below.
function makeRow(overrides: Partial<{
  id: string;
  taskId: string;
  userId: string;
  status: string;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "i1",
    taskId: overrides.taskId ?? "t1",
    userId: overrides.userId ?? "u1",
    status: overrides.status ?? "pending",
    source: null,
    signature: "signup",
    completedAt: null,
    assignedByAdminId: null,
    completedByAdminId: null,
    createdAt: overrides.createdAt ?? new Date("2026-05-31T12:00:00Z"),
    updatedAt: overrides.createdAt ?? new Date("2026-05-31T12:00:00Z"),
    user: { id: overrides.userId ?? "u1", email: "alice@example.com", name: "Alice" },
    task: { id: overrides.taskId ?? "t1", title: "Upload avatar" },
  };
}

describe("GET /api/super-admin/tasks/instances", () => {
  it("returns 401 when not authenticated", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: UNAUTHORIZED_RESPONSE });

    const res = await listInstances(new Request("http://x/api/super-admin/tasks/instances"));
    expect(res.status).toBe(401);
    expect(prismaMock.taskInstance.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but not an admin", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: FORBIDDEN_RESPONSE });

    const res = await listInstances(new Request("http://x/api/super-admin/tasks/instances"));
    expect(res.status).toBe(403);
  });

  it("rejects an unknown status value with 400", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?status=archived"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.taskInstance.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed cursor with 400", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?cursor=garbage"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.taskInstance.findMany).not.toHaveBeenCalled();
  });

  it("returns all instances when no filters are passed", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([makeRow()]);

    const res = await listInstances(new Request("http://x/api/super-admin/tasks/instances"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instances).toHaveLength(1);
    expect(body.nextCursor).toBeNull();

    // No filter parts, so `where` is undefined; orderBy is the
    // composite (createdAt desc, id desc); take=51 (limit+1).
    const call = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    expect(call.where).toBeUndefined();
    expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(call.take).toBe(51);
  });

  it("scopes by status=pending", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      makeRow({ id: "i1", status: "pending" }),
    ]);

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?status=pending"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    expect(call.where).toEqual({ AND: [{ status: "pending" }] });
  });

  it("scopes by taskId", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      makeRow({ taskId: "t9" }),
    ]);

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?taskId=t9"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    expect(call.where).toEqual({ AND: [{ taskId: "t9" }] });
  });

  it("scopes by userId", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([makeRow({ userId: "u9" })]);

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?userId=u9"),
    );
    expect(res.status).toBe(200);
    const call = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    expect(call.where).toEqual({ AND: [{ userId: "u9" }] });
  });

  it("composes multiple filters with AND semantics", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([]);

    await listInstances(
      new Request(
        "http://x/api/super-admin/tasks/instances?status=pending&taskId=t1&userId=u1",
      ),
    );
    const call = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    expect(call.where).toEqual({
      AND: [{ userId: "u1" }, { taskId: "t1" }, { status: "pending" }],
    });
  });

  it("returns a nextCursor when more rows are available than limit", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    // limit=2; we return 3 rows so the handler slices off the last
    // one and emits `nextCursor` pointing at the boundary row.
    const t = new Date("2026-05-31T12:00:00Z");
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      makeRow({ id: "i1", createdAt: new Date(t.getTime() + 2000) }),
      makeRow({ id: "i2", createdAt: new Date(t.getTime() + 1000) }),
      makeRow({ id: "i3", createdAt: t }),
    ]);

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?limit=2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instances).toHaveLength(2);
    expect(body.nextCursor).toBe(
      `${new Date(t.getTime() + 1000).toISOString()}_i2`,
    );
  });

  it("does not return a nextCursor when the page is short", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([makeRow()]);

    const res = await listInstances(
      new Request("http://x/api/super-admin/tasks/instances?limit=5"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextCursor).toBeNull();
  });

  it("translates a cursor into the WHERE comparison for the second page", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([]);

    const cursorIso = "2026-05-31T10:00:00.000Z";
    const cursorId = "i_boundary";
    const cursor = `${cursorIso}_${cursorId}`;
    await listInstances(
      new Request(
        `http://x/api/super-admin/tasks/instances?cursor=${encodeURIComponent(cursor)}`,
      ),
    );

    const call = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    // The cursor predicate must implement the `(createdAt, id) <
    // (cursorCreatedAt, cursorId)` tuple. We assert the shape: a
    // single AND entry containing the OR-with-tie-break.
    expect(call.where.AND).toHaveLength(1);
    const cursorPart = call.where.AND[0];
    expect(cursorPart.OR).toBeDefined();
    expect(cursorPart.OR[0]).toEqual({
      createdAt: { lt: new Date(cursorIso) },
    });
    expect(cursorPart.OR[1]).toEqual({
      AND: [
        { createdAt: new Date(cursorIso) },
        { id: { lt: cursorId } },
      ],
    });
  });
});

describe("POST /api/super-admin/tasks/instances/{id}/complete", () => {
  it("returns 401 when guard fails", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: UNAUTHORIZED_RESPONSE });

    const res = await completeInstance(new Request("http://x"), makeContext("i1"));
    expect(res.status).toBe(401);
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but not an admin", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: FORBIDDEN_RESPONSE });

    const res = await completeInstance(new Request("http://x"), makeContext("i1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the instance does not exist", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce(null);

    const res = await completeInstance(new Request("http://x"), makeContext("missing"));
    expect(res.status).toBe(404);
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the instance is already completed", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "completed",
    });

    const res = await completeInstance(new Request("http://x"), makeContext("i1"));
    expect(res.status).toBe(409);
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });

  it("flips a pending instance with source=admin and completedByAdminId", async () => {
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { id: "admin-42" } },
    });
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: "pending",
    });
    prismaMock.taskInstance.update.mockResolvedValueOnce({
      id: "i1",
      taskId: "t1",
      userId: "u1",
      status: "completed",
      source: "admin",
      signature: "manual:2026-05-31T12:00:00.000Z",
      completedAt: new Date("2026-05-31T12:30:00Z"),
      assignedByAdminId: null,
      completedByAdminId: "admin-42",
      createdAt: new Date("2026-05-31T12:00:00Z"),
      updatedAt: new Date("2026-05-31T12:30:00Z"),
    });

    const res = await completeInstance(new Request("http://x"), makeContext("i1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instance.status).toBe("completed");
    expect(body.instance.source).toBe("admin");
    expect(body.instance.completedByAdminId).toBe("admin-42");

    // Verify the write set the right fields. `completedAt` is a Date —
    // assert one was set rather than a specific value.
    const call = prismaMock.taskInstance.update.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "i1" });
    expect(call.data.status).toBe("completed");
    expect(call.data.source).toBe("admin");
    expect(call.data.completedByAdminId).toBe("admin-42");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });
});
