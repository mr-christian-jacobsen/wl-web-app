import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks. The bodies reference only the factory-scope so the
// hoisting is safe. We re-grab the same refs after import so tests can
// drive the mocks directly.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
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

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET as listTasks } from "@/app/api/tasks/route";
import { POST as completeTask } from "@/app/api/tasks/[id]/complete/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const prismaMock = prisma as unknown as {
  taskInstance: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  authMock.mockReset();
  prismaMock.taskInstance.findMany.mockReset();
  prismaMock.taskInstance.findUnique.mockReset();
  prismaMock.taskInstance.update.mockReset();
});

// Helper that builds the second argument the Next.js App Router hands
// to `[id]` route handlers — the `params` is a Promise per Next 15.
function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/tasks", () => {
  it("returns 401 when no session", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await listTasks();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    // No DB call should be made when unauthenticated.
    expect(prismaMock.taskInstance.findMany).not.toHaveBeenCalled();
  });

  it("scopes both queries to session.user.id and returns pending + completed", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });

    const pending = [
      {
        id: "i1",
        taskId: "t1",
        userId: "u1",
        status: "pending",
        source: null,
        signature: "signup",
        completedAt: null,
        assignedByAdminId: null,
        completedByAdminId: null,
        createdAt: new Date("2026-05-31T10:00:00Z"),
        updatedAt: new Date("2026-05-31T10:00:00Z"),
        task: { title: "Upload avatar", description: null, predicateKey: "avatar_present" },
      },
    ];
    const completed = [
      {
        id: "i2",
        taskId: "t2",
        userId: "u1",
        status: "completed",
        source: "user",
        signature: "signup",
        completedAt: new Date("2026-05-30T09:00:00Z"),
        assignedByAdminId: null,
        completedByAdminId: null,
        createdAt: new Date("2026-05-30T08:00:00Z"),
        updatedAt: new Date("2026-05-30T09:00:00Z"),
        task: { title: "Pick language", description: "Choose your language.", predicateKey: "language_set" },
      },
    ];

    prismaMock.taskInstance.findMany
      .mockResolvedValueOnce(pending) // pending call first
      .mockResolvedValueOnce(completed); // completed call second

    const res = await listTasks();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Both arrays returned and grouped correctly.
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0].id).toBe("i1");
    expect(body.completed).toHaveLength(1);
    expect(body.completed[0].id).toBe("i2");

    // Both queries must scope by userId — never accept a query param.
    expect(prismaMock.taskInstance.findMany).toHaveBeenCalledTimes(2);
    const firstCall = prismaMock.taskInstance.findMany.mock.calls[0]![0];
    const secondCall = prismaMock.taskInstance.findMany.mock.calls[1]![0];
    expect(firstCall.where.userId).toBe("u1");
    expect(firstCall.where.status).toBe("pending");
    expect(firstCall.orderBy).toEqual({ createdAt: "desc" });
    expect(secondCall.where.userId).toBe("u1");
    expect(secondCall.where.status).toBe("completed");
    expect(secondCall.orderBy).toEqual({ createdAt: "desc" });
  });

  it("returns empty arrays for a user with no instances", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u3" } });
    prismaMock.taskInstance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await listTasks();
    const body = await res.json();
    expect(body.pending).toEqual([]);
    expect(body.completed).toEqual([]);
  });
});

describe("POST /api/tasks/{id}/complete", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await completeTask(new Request("http://x"), makeContext("i1"));

    expect(res.status).toBe(401);
    expect(prismaMock.taskInstance.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });

  it("flips own pending instance to completed with source 'user'", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce({
      id: "i1",
      userId: "u1",
      status: "pending",
    });
    const now = new Date("2026-05-31T12:00:00Z");
    prismaMock.taskInstance.update.mockResolvedValueOnce({
      id: "i1",
      userId: "u1",
      taskId: "t1",
      status: "completed",
      source: "user",
      completedAt: now,
    });

    const res = await completeTask(new Request("http://x"), makeContext("i1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instance.id).toBe("i1");
    expect(body.instance.source).toBe("user");

    // Verify the write set the right fields. `completedAt` is a Date —
    // we don't assert on its exact value, just that one was set.
    expect(prismaMock.taskInstance.update).toHaveBeenCalledTimes(1);
    const call = prismaMock.taskInstance.update.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "i1" });
    expect(call.data.status).toBe("completed");
    expect(call.data.source).toBe("user");
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("returns 404 (not 403) for another user's instance — IDOR boundary", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    // The instance exists but belongs to a different user — endpoint
    // must collapse "not found" and "not yours" into the same 404 so
    // it can't be used to probe ids.
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce({
      id: "i9",
      userId: "u2",
      status: "pending",
    });

    const res = await completeTask(new Request("http://x"), makeContext("i9"));
    expect(res.status).toBe(404);
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the id does not exist", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce(null);

    const res = await completeTask(new Request("http://x"), makeContext("nope"));
    expect(res.status).toBe(404);
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the instance is already completed", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce({
      id: "i1",
      userId: "u1",
      status: "completed",
    });

    const res = await completeTask(new Request("http://x"), makeContext("i1"));
    expect(res.status).toBe(409);
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
  });
});

describe("middleware /tasks gating", () => {
  // Lightweight static-source-read assertion. The full middleware
  // matcher harness needs a Next.js runtime; reading the source string
  // is the same approach the openapi-coverage test uses for the route
  // file walk and it catches the only thing U9 changed here — that
  // `/tasks` was added to the PROTECTED array.
  it("PROTECTED includes /tasks", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/middleware.ts"),
      "utf8",
    );
    expect(src).toMatch(/const PROTECTED\s*=\s*\[[^\]]*"\/tasks"/);
  });

  it("SUPER_ADMIN_ONLY does NOT include /tasks (regression guard)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/middleware.ts"),
      "utf8",
    );
    const match = src.match(/const SUPER_ADMIN_ONLY\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toMatch(/"\/tasks"/);
  });
});
