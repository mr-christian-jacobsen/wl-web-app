import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above imports, so any state the factory references
// must live inside the factory. We re-grab the handles after import via
// the mocked module objects so tests can drive the mocks from outside.
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    taskInstance: { findMany: vi.fn(), updateMany: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/log.server", () => ({
  logError: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import {
  KNOWN_PREDICATES,
  evaluatePredicate,
  getPredicate,
  reevaluatePendingInstancesForUser,
} from "@/lib/predicates";

// Re-typed handles for ergonomic mock access in the test bodies.
const prismaMock = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  taskInstance: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  notification: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};
const logErrorMock = logError as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.taskInstance.findMany.mockReset();
  prismaMock.taskInstance.updateMany.mockReset();
  prismaMock.notification.create.mockReset();
  prismaMock.notification.findMany.mockReset();
  logErrorMock.mockReset();
});

describe("KNOWN_PREDICATES registry", () => {
  it("exposes exactly the three v1 entries", () => {
    expect(KNOWN_PREDICATES).toHaveLength(3);
    const keys = KNOWN_PREDICATES.map((p) => p.key);
    expect(keys).toEqual(["avatar_present", "email_verified", "language_set"]);
  });

  it("keys are unique", () => {
    const keys = KNOWN_PREDICATES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has the required fields", () => {
    for (const p of KNOWN_PREDICATES) {
      expect(p.key).toMatch(/^[a-z][a-z_]+$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(typeof p.evaluate).toBe("function");
    }
  });

  it("avatar_present and language_set deep-link to /profile; email_verified has none", () => {
    expect(getPredicate("avatar_present")?.deepLinkPath).toBe("/profile");
    expect(getPredicate("language_set")?.deepLinkPath).toBe("/profile");
    expect(getPredicate("email_verified")?.deepLinkPath).toBeUndefined();
  });

  it("does not include the dropped name_set entry from the original brainstorm", () => {
    // Cast to string[] so we can probe for keys that aren't in the typed
    // union — the whole point of the test is that name_set isn't there.
    const keys: string[] = KNOWN_PREDICATES.map((p) => p.key);
    expect(keys).not.toContain("name_set");
  });
});

describe("evaluatePredicate", () => {
  it("avatar_present returns true when avatarUrl is set", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ avatarUrl: "/api/avatar/u1?v=1" });
    await expect(evaluatePredicate("avatar_present", "u1")).resolves.toBe(true);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { avatarUrl: true },
    });
  });

  it("avatar_present returns false when avatarUrl is null", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ avatarUrl: null });
    await expect(evaluatePredicate("avatar_present", "u1")).resolves.toBe(false);
  });

  it("avatar_present returns false when the user is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await expect(evaluatePredicate("avatar_present", "ghost")).resolves.toBe(false);
  });

  it("email_verified returns true when emailVerifiedAt is set", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ emailVerifiedAt: new Date() });
    await expect(evaluatePredicate("email_verified", "u1")).resolves.toBe(true);
  });

  it("email_verified returns false when emailVerifiedAt is null", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ emailVerifiedAt: null });
    await expect(evaluatePredicate("email_verified", "u1")).resolves.toBe(false);
  });

  it("language_set returns true when languageId is set", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ languageId: "lang-gb-en" });
    await expect(evaluatePredicate("language_set", "u1")).resolves.toBe(true);
  });

  it("language_set returns false when languageId is null", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ languageId: null });
    await expect(evaluatePredicate("language_set", "u1")).resolves.toBe(false);
  });

  it("throws on an unknown predicate key", async () => {
    await expect(evaluatePredicate("not_a_real_key", "u1")).rejects.toThrow(
      /unknown predicate key/i,
    );
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("reevaluatePendingInstancesForUser", () => {
  it("no pending instances → no writes", async () => {
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([]);
    await reevaluatePendingInstancesForUser("u1");
    expect(prismaMock.taskInstance.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.taskInstance.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("single matching pending instance → flips to completed (source: predicate)", async () => {
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      { id: "inst-1", task: { predicateKey: "avatar_present" } },
    ]);
    // avatar_present evaluate -> findUnique returns avatarUrl set
    prismaMock.user.findUnique.mockResolvedValueOnce({ avatarUrl: "/x" });
    prismaMock.taskInstance.updateMany.mockResolvedValueOnce({ count: 1 });

    await reevaluatePendingInstancesForUser("u1");

    expect(prismaMock.taskInstance.updateMany).toHaveBeenCalledTimes(1);
    const call = prismaMock.taskInstance.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: { in: ["inst-1"] }, status: "pending" });
    expect(call.data.status).toBe("completed");
    expect(call.data.source).toBe("predicate");
    expect(call.data.completedAt).toBeInstanceOf(Date);
    // Critically: no notification ever fires from this code path (R11).
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("non-matching pending instance → stays pending (no update call)", async () => {
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      { id: "inst-1", task: { predicateKey: "avatar_present" } },
    ]);
    prismaMock.user.findUnique.mockResolvedValueOnce({ avatarUrl: null });

    await reevaluatePendingInstancesForUser("u1");

    expect(prismaMock.taskInstance.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("mixed batch — only matching ones flip", async () => {
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      { id: "i-avatar", task: { predicateKey: "avatar_present" } },
      { id: "i-email", task: { predicateKey: "email_verified" } },
      { id: "i-lang", task: { predicateKey: "language_set" } },
    ]);
    // avatar: match
    prismaMock.user.findUnique.mockResolvedValueOnce({ avatarUrl: "/x" });
    // email: no match
    prismaMock.user.findUnique.mockResolvedValueOnce({ emailVerifiedAt: null });
    // lang: match
    prismaMock.user.findUnique.mockResolvedValueOnce({ languageId: "L1" });
    prismaMock.taskInstance.updateMany.mockResolvedValueOnce({ count: 2 });

    await reevaluatePendingInstancesForUser("u1");

    expect(prismaMock.taskInstance.updateMany).toHaveBeenCalledTimes(1);
    const call = prismaMock.taskInstance.updateMany.mock.calls[0]![0];
    expect(call.where.id.in).toEqual(["i-avatar", "i-lang"]);
    expect(call.data.source).toBe("predicate");
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("instance whose task predicate is unknown is skipped silently", async () => {
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([
      { id: "i-mystery", task: { predicateKey: "deprecated_key" } },
    ]);
    await reevaluatePendingInstancesForUser("u1");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.updateMany).not.toHaveBeenCalled();
  });

  it("idempotent — re-running over already-completed users is a no-op (findMany filters status='pending')", async () => {
    // Simulating "no pending rows after the first run completed everything"
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([]);
    await reevaluatePendingInstancesForUser("u1");
    await reevaluatePendingInstancesForUser("u1");
    // No errors, no writes.
    expect(prismaMock.taskInstance.updateMany).not.toHaveBeenCalled();
  });

  it("swallows and logs DB errors — fire-and-forget contract", async () => {
    const boom = new Error("DB unreachable");
    prismaMock.taskInstance.findMany.mockRejectedValueOnce(boom);
    // Must not throw.
    await reevaluatePendingInstancesForUser("u1");
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![0]).toBe(boom);
    expect(prismaMock.taskInstance.updateMany).not.toHaveBeenCalled();
  });

  it("filters at the DB layer to only pending instances with a non-null predicateKey", async () => {
    prismaMock.taskInstance.findMany.mockResolvedValueOnce([]);
    await reevaluatePendingInstancesForUser("u1");
    const where = prismaMock.taskInstance.findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe("u1");
    expect(where.status).toBe("pending");
    expect(where.task).toEqual({ predicateKey: { not: null } });
  });
});
