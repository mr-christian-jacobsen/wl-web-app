import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Handler tests for the U7 admin task CRUD endpoints.
 *
 *   GET / POST    /api/super-admin/tasks
 *   GET / PATCH / DELETE  /api/super-admin/tasks/{id}
 *
 * Coverage:
 *   - `requireSuperAdmin()` guard short-circuits on every route.
 *   - POST returns 201 with the created task.
 *   - PATCH returns 200 with the updated task.
 *   - DELETE refuses (409) when instances exist; mirrors the
 *     language-delete-refuse-on-children pattern.
 *   - GET single returns 404 on unknown id.
 */

vi.mock("@/lib/super-admin", () => ({
  requireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskTrigger: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  DELETE as deleteTask,
  GET as getTask,
  PATCH as patchTask,
} from "@/app/api/super-admin/tasks/[id]/route";
import {
  GET as listTasks,
  POST as createTask,
} from "@/app/api/super-admin/tasks/route";

const guardMock = requireSuperAdmin as unknown as ReturnType<typeof vi.fn>;
const prismaMock = prisma as unknown as {
  task: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  taskTrigger: {
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const FORBIDDEN_RESPONSE = NextResponse.json({ error: "Forbidden" }, { status: 403 });
const UNAUTHORIZED_RESPONSE = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  guardMock.mockReset();
  prismaMock.task.findMany.mockReset();
  prismaMock.task.findUnique.mockReset();
  prismaMock.task.findUniqueOrThrow.mockReset();
  prismaMock.task.create.mockReset();
  prismaMock.task.update.mockReset();
  prismaMock.task.delete.mockReset();
  prismaMock.taskTrigger.deleteMany.mockReset();
  prismaMock.$transaction.mockReset();
});

describe("GET /api/super-admin/tasks", () => {
  it("returns the guard response when not authenticated", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: UNAUTHORIZED_RESPONSE });

    const res = await listTasks();
    expect(res.status).toBe(401);
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it("returns the guard response when not an admin", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: FORBIDDEN_RESPONSE });

    const res = await listTasks();
    expect(res.status).toBe(403);
  });

  it("orders by updatedAt desc and flattens _count into instanceCount / triggerCount", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "t1",
        title: "Upload avatar",
        description: null,
        predicateKey: "avatar_present",
        enabled: true,
        createdAt: new Date("2026-05-01"),
        updatedAt: new Date("2026-05-31"),
        _count: { instances: 7, triggers: 2 },
      },
    ]);

    const res = await listTasks();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]).toMatchObject({
      id: "t1",
      instanceCount: 7,
      triggerCount: 2,
    });
    // Verify orderBy is updatedAt desc — the list page depends on this.
    const call = prismaMock.task.findMany.mock.calls[0]![0];
    expect(call.orderBy).toEqual({ updatedAt: "desc" });
  });
});

describe("POST /api/super-admin/tasks", () => {
  it("returns 401 when guard fails", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: UNAUTHORIZED_RESPONSE });

    const res = await createTask(
      new Request("http://x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "X", triggers: [{ kind: "signup" }] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });

    const res = await createTask(
      new Request("http://x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Empty triggers is rejected by the validator.
        body: JSON.stringify({ title: "X", triggers: [] }),
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("returns 201 on success and threads triggers through the create", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.create.mockResolvedValueOnce({
      id: "t1",
      title: "Upload avatar",
      description: null,
      predicateKey: "avatar_present",
      enabled: false,
      createdAt: new Date("2026-05-31"),
      updatedAt: new Date("2026-05-31"),
      _count: { instances: 0, triggers: 1 },
    });

    const res = await createTask(
      new Request("http://x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Upload avatar",
          predicateKey: "avatar_present",
          triggers: [
            { kind: "signup" },
            { kind: "specific_date", dates: ["2026-06-01"] },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.id).toBe("t1");
    expect(body.task.instanceCount).toBe(0);

    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    const call = prismaMock.task.create.mock.calls[0]![0];
    // Trigger array converted: specific_date.dates → dateList newline-joined.
    expect(call.data.triggers.create).toEqual([
      { kind: "signup", intervalDays: null, dateList: null },
      { kind: "specific_date", intervalDays: null, dateList: "2026-06-01" },
    ]);
    // enabled defaults to false when omitted.
    expect(call.data.enabled).toBe(false);
  });
});

describe("GET /api/super-admin/tasks/{id}", () => {
  it("returns 404 when the task is not found", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    const res = await getTask(new Request("http://x"), makeContext("missing"));
    expect(res.status).toBe(404);
  });

  it("returns the task with its triggers and instance count", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      title: "Upload avatar",
      description: null,
      predicateKey: "avatar_present",
      enabled: true,
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-31"),
      triggers: [
        { id: "tr1", kind: "signup", intervalDays: null, dateList: null },
      ],
      _count: { instances: 3 },
    });

    const res = await getTask(new Request("http://x"), makeContext("t1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.id).toBe("t1");
    expect(body.task.instanceCount).toBe(3);
    expect(body.task.triggers).toHaveLength(1);
  });
});

describe("PATCH /api/super-admin/tasks/{id}", () => {
  it("returns 401 when guard fails", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: UNAUTHORIZED_RESPONSE });

    const res = await patchTask(
      new Request("http://x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "X" }),
      }),
      makeContext("t1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid input", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });

    const res = await patchTask(
      new Request("http://x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}), // refine requires at least one field
      }),
      makeContext("t1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful update", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    // PATCH wraps the work in $transaction; we have it return what the
    // route reads via tx.task.findUniqueOrThrow.
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => unknown) => {
      // The transaction callback uses tx.* methods; we drive them via
      // the prismaMock so the test verifies what the route asks for.
      prismaMock.task.findUniqueOrThrow.mockResolvedValueOnce({
        id: "t1",
        title: "Renamed",
        description: null,
        predicateKey: null,
        enabled: false,
        createdAt: new Date("2026-05-01"),
        updatedAt: new Date("2026-05-31"),
        triggers: [],
        _count: { instances: 0 },
      });
      return fn(prismaMock);
    });

    const res = await patchTask(
      new Request("http://x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Renamed" }),
      }),
      makeContext("t1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.title).toBe("Renamed");
  });
});

describe("DELETE /api/super-admin/tasks/{id}", () => {
  it("returns 401 when guard fails", async () => {
    guardMock.mockResolvedValueOnce({ ok: false, response: UNAUTHORIZED_RESPONSE });

    const res = await deleteTask(new Request("http://x"), makeContext("t1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the task does not exist", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    const res = await deleteTask(new Request("http://x"), makeContext("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 409 HAS_INSTANCES when the task has any instances", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      _count: { instances: 5 },
    });

    const res = await deleteTask(new Request("http://x"), makeContext("t1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("HAS_INSTANCES");
    expect(body.instanceCount).toBe(5);
    expect(prismaMock.task.delete).not.toHaveBeenCalled();
  });

  it("returns 200 ok:true when the task has zero instances", async () => {
    guardMock.mockResolvedValueOnce({ ok: true, session: { user: { id: "a1" } } });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "t1",
      _count: { instances: 0 },
    });
    prismaMock.task.delete.mockResolvedValueOnce({ id: "t1" });

    const res = await deleteTask(new Request("http://x"), makeContext("t1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(prismaMock.task.delete).toHaveBeenCalledTimes(1);
  });
});
