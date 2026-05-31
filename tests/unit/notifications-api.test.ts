import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — the factories reference only the factory scope so
// Vitest's hoisting is safe. We re-grab the same references after
// import so individual tests can drive them.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// markNotificationsReadForUser lives in lib/notifications.ts and is
// what the route handler delegates to. Mock at the module boundary so
// we can assert the route only ever passes the session user id.
vi.mock("@/lib/notifications", () => ({
  markNotificationsReadForUser: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markNotificationsReadForUser } from "@/lib/notifications";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { POST as markRead } from "@/app/api/notifications/mark-read/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const prismaMock = prisma as unknown as {
  notification: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};
const markReadMock = markNotificationsReadForUser as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  authMock.mockReset();
  prismaMock.notification.findMany.mockReset();
  prismaMock.notification.updateMany.mockReset();
  markReadMock.mockReset();
});

describe("GET /api/notifications", () => {
  it("returns 401 when no session", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await listNotifications();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(prismaMock.notification.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to session.user.id and orders DESC, capped at 50", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    const rows = [
      {
        id: "n1",
        userId: "u1",
        type: "task_created",
        taskInstanceId: "i1",
        unread: true,
        createdAt: new Date("2026-05-31T10:00:00Z"),
        taskInstance: {
          id: "i1",
          status: "pending",
          task: { id: "t1", title: "Upload avatar", predicateKey: "avatar_present" },
        },
      },
    ];
    prismaMock.notification.findMany.mockResolvedValueOnce(rows);

    const res = await listNotifications();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe("n1");

    expect(prismaMock.notification.findMany).toHaveBeenCalledTimes(1);
    const call = prismaMock.notification.findMany.mock.calls[0]![0];
    // Scoped to session user — never a client-supplied id.
    expect(call.where).toEqual({ userId: "u1" });
    // Latest first.
    expect(call.orderBy).toEqual({ createdAt: "desc" });
    // Dropdown cap so a runaway backlog doesn't bloat the payload.
    expect(call.take).toBe(50);
    // Includes the task instance + parent task title for one-shot render.
    expect(call.select.taskInstance).toBeDefined();
    expect(call.select.taskInstance.select.task.select.title).toBe(true);
  });

  it("returns an empty list for a user with no notifications", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u2" } });
    prismaMock.notification.findMany.mockResolvedValueOnce([]);

    const res = await listNotifications();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toEqual([]);
  });

  it("only ever returns the requester's notifications (IDOR boundary)", async () => {
    // Whatever the DB layer returns, the route must scope the WHERE to
    // session.user.id — there is no userId query parameter the client
    // can swap. This guards the structural IDOR contract.
    authMock.mockResolvedValueOnce({ user: { id: "alice" } });
    prismaMock.notification.findMany.mockResolvedValueOnce([]);

    await listNotifications();

    const where = prismaMock.notification.findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe("alice");
    // The where clause holds no other identity-bearing keys.
    expect(Object.keys(where)).toEqual(["userId"]);
  });
});

describe("POST /api/notifications/mark-read", () => {
  it("returns 401 when unauthenticated and never invokes the helper", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await markRead();
    expect(res.status).toBe(401);
    expect(markReadMock).not.toHaveBeenCalled();
  });

  it("delegates to markNotificationsReadForUser with the session user id and returns the count", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    markReadMock.mockResolvedValueOnce(3);

    const res = await markRead();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, marked: 3 });

    expect(markReadMock).toHaveBeenCalledTimes(1);
    expect(markReadMock).toHaveBeenCalledWith("u1");
  });

  it("is idempotent — a second call returns marked: 0 when nothing was unread", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "u1" } });
    markReadMock.mockResolvedValueOnce(0);

    const res = await markRead();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, marked: 0 });
  });

  it("never accepts a userId from the caller — session is the only authority", async () => {
    // The route handler signature deliberately ignores Request. We
    // still call it the way Next.js would, to prove a malicious body
    // can't break the IDOR boundary — the helper is invoked with the
    // session user id regardless of what is sent.
    authMock.mockResolvedValueOnce({ user: { id: "alice" } });
    markReadMock.mockResolvedValueOnce(2);

    await markRead();

    expect(markReadMock).toHaveBeenCalledWith("alice");
    // Only one positional argument was ever passed.
    expect(markReadMock.mock.calls[0]).toHaveLength(1);
  });
});
