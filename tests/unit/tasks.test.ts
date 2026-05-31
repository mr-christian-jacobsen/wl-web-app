import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above the imports — anything the factories
// reference has to live inside them. The handles after the imports
// re-grab the same object refs so the test bodies can drive the mocks.
vi.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskInstance: {
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/log.server", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  dispatchTaskCreatedFor: vi.fn(),
}));

vi.mock("@/lib/predicates", () => ({
  evaluatePredicate: vi.fn(),
}));

vi.mock("@/lib/system-settings", () => ({
  isTasksSchedulerEnabled: vi.fn(),
  getBackfillBatchSize: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import { dispatchTaskCreatedFor } from "@/lib/notifications";
import { evaluatePredicate } from "@/lib/predicates";
import {
  getBackfillBatchSize,
  isTasksSchedulerEnabled,
} from "@/lib/system-settings";
import {
  TasksSchedulerDisabledError,
  countBackfillTargets,
  createInstancesForSignup,
  manuallyAssignInstance,
  runBackfillForDefinition,
} from "@/lib/tasks";

const prismaMock = prisma as unknown as {
  task: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  taskInstance: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  user: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};
const logErrorMock = logError as unknown as ReturnType<typeof vi.fn>;
const dispatchMock = dispatchTaskCreatedFor as unknown as ReturnType<typeof vi.fn>;
const evaluatePredicateMock = evaluatePredicate as unknown as ReturnType<typeof vi.fn>;
const isTasksSchedulerEnabledMock = isTasksSchedulerEnabled as unknown as ReturnType<typeof vi.fn>;
const getBackfillBatchSizeMock = getBackfillBatchSize as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prismaMock.task.findMany.mockReset();
  prismaMock.task.findUnique.mockReset();
  prismaMock.task.update.mockReset();
  prismaMock.taskInstance.create.mockReset();
  prismaMock.taskInstance.update.mockReset();
  prismaMock.taskInstance.upsert.mockReset();
  prismaMock.user.count.mockReset();
  prismaMock.user.findMany.mockReset();
  logErrorMock.mockReset();
  dispatchMock.mockReset();
  evaluatePredicateMock.mockReset();
  isTasksSchedulerEnabledMock.mockReset();
  getBackfillBatchSizeMock.mockReset();
  // Default: scheduler is on. Individual tests flip this to false.
  isTasksSchedulerEnabledMock.mockResolvedValue(true);
  // Default: ample batch size. Batching test overrides this to 50.
  getBackfillBatchSizeMock.mockResolvedValue(500);
});

describe("createInstancesForSignup", () => {
  it("zero enabled signup-triggered definitions → no instances created, no notifications", async () => {
    prismaMock.task.findMany.mockResolvedValueOnce([]);

    await createInstancesForSignup("u1");

    expect(prismaMock.task.findMany).toHaveBeenCalledTimes(1);
    // The where clause must filter for enabled + at least one signup trigger.
    const findManyCall = prismaMock.task.findMany.mock.calls[0]![0];
    expect(findManyCall.where).toEqual({
      enabled: true,
      triggers: { some: { kind: "signup" } },
    });
    expect(prismaMock.taskInstance.create).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.update).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(evaluatePredicateMock).not.toHaveBeenCalled();
  });

  it("three definitions [match, no-match, no predicate] → 3 instances, 1 silent-complete, 2 notifications", async () => {
    // Three enabled signup-triggered task definitions. The first has a
    // matching predicate (silent complete); the second has a non-matching
    // predicate (pending + notification); the third has no predicate at
    // all (pending + notification).
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-match", predicateKey: "avatar_present" },
      { id: "task-no-match", predicateKey: "email_verified" },
      { id: "task-no-predicate", predicateKey: null },
    ]);

    // Three create calls return three rows.
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-match",
      userId: "u1",
      taskId: "task-match",
    });
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-no-match",
      userId: "u1",
      taskId: "task-no-match",
    });
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-no-predicate",
      userId: "u1",
      taskId: "task-no-predicate",
    });

    // Predicate evaluations: first matches, second doesn't.
    evaluatePredicateMock.mockResolvedValueOnce(true); // avatar_present
    evaluatePredicateMock.mockResolvedValueOnce(false); // email_verified

    prismaMock.taskInstance.update.mockResolvedValueOnce({});

    await createInstancesForSignup("u1");

    // Three instances created with signature "signup" + source null.
    expect(prismaMock.taskInstance.create).toHaveBeenCalledTimes(3);
    for (const call of prismaMock.taskInstance.create.mock.calls) {
      expect(call[0].data).toMatchObject({
        userId: "u1",
        status: "pending",
        signature: "signup",
        source: null,
      });
    }

    // The matching one flipped to completed via update (R7).
    expect(prismaMock.taskInstance.update).toHaveBeenCalledTimes(1);
    const updateCall = prismaMock.taskInstance.update.mock.calls[0]![0];
    expect(updateCall.where).toEqual({ id: "inst-match" });
    expect(updateCall.data.status).toBe("completed");
    expect(updateCall.data.source).toBe("predicate");
    expect(updateCall.data.completedAt).toBeInstanceOf(Date);

    // Two notifications dispatched — the no-match and no-predicate cases.
    expect(dispatchMock).toHaveBeenCalledTimes(2);
    const dispatched = dispatchMock.mock.calls.map((c) => c[0].id);
    expect(dispatched).toEqual(
      expect.arrayContaining(["inst-no-match", "inst-no-predicate"]),
    );
    // Importantly: no notification for the silent-complete row.
    expect(dispatched).not.toContain("inst-match");
  });

  it("scheduler disabled → returns early, no instances created", async () => {
    isTasksSchedulerEnabledMock.mockResolvedValueOnce(false);

    await createInstancesForSignup("u1");

    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.create).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("swallows + logs errors (fire-and-forget contract)", async () => {
    const boom = new Error("DB down");
    prismaMock.task.findMany.mockRejectedValueOnce(boom);

    // Must not throw.
    await createInstancesForSignup("u1");

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![0]).toBe(boom);
  });

  it("per-definition failure does not abort the whole fan-out", async () => {
    // Two definitions; the first create throws (e.g., unique-constraint
    // race), the second should still be processed.
    prismaMock.task.findMany.mockResolvedValueOnce([
      { id: "task-bad", predicateKey: null },
      { id: "task-good", predicateKey: null },
    ]);
    prismaMock.taskInstance.create.mockRejectedValueOnce(
      new Error("unique constraint violated"),
    );
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-good",
      userId: "u1",
      taskId: "task-good",
    });

    await createInstancesForSignup("u1");

    // Bad one logged; good one dispatched.
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock.mock.calls[0]![0].id).toBe("inst-good");
  });
});

describe("manuallyAssignInstance", () => {
  function stubTaskPredicate(taskId: string, predicateKey: string | null) {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: taskId,
      predicateKey,
    });
  }

  it("non-matching predicate → instance pending with assignedByAdminId set, notification dispatched", async () => {
    stubTaskPredicate("task-1", "email_verified");
    evaluatePredicateMock.mockResolvedValueOnce(false);
    const created = {
      id: "inst-1",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      source: null,
      signature: "manual:2026-06-01T00:00:00.000Z",
      completedAt: null,
      assignedByAdminId: "admin-1",
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.taskInstance.create.mockResolvedValueOnce(created);

    const result = await manuallyAssignInstance("task-1", "u1", "admin-1");

    expect(result).toEqual(created);
    expect(prismaMock.taskInstance.create).toHaveBeenCalledTimes(1);
    const createCall = prismaMock.taskInstance.create.mock.calls[0]![0];
    expect(createCall.data).toMatchObject({
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      source: null,
      assignedByAdminId: "admin-1",
    });
    expect(createCall.data.signature).toMatch(/^manual:\d{4}-\d{2}-\d{2}T/);
    expect(createCall.data.completedAt).toBeUndefined();

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock.mock.calls[0]![0]).toEqual({
      id: "inst-1",
      userId: "u1",
      taskId: "task-1",
    });
  });

  it("immediately-matching predicate → instance completed (source: predicate), assignedByAdminId still set, no notification (AE5b)", async () => {
    stubTaskPredicate("task-1", "avatar_present");
    evaluatePredicateMock.mockResolvedValueOnce(true);
    const created = {
      id: "inst-1",
      taskId: "task-1",
      userId: "u1",
      status: "completed",
      source: "predicate",
      signature: "manual:2026-06-01T00:00:00.000Z",
      completedAt: new Date(),
      assignedByAdminId: "admin-1",
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.taskInstance.create.mockResolvedValueOnce(created);

    const result = await manuallyAssignInstance("task-1", "u1", "admin-1");

    expect(result).toEqual(created);
    expect(prismaMock.taskInstance.create).toHaveBeenCalledTimes(1);
    const createCall = prismaMock.taskInstance.create.mock.calls[0]![0];
    // Critical: created completed with source 'predicate' AND assignedByAdminId
    // still set (audit trail preserved per KTD6 / U4 contract).
    expect(createCall.data).toMatchObject({
      taskId: "task-1",
      userId: "u1",
      status: "completed",
      source: "predicate",
      assignedByAdminId: "admin-1",
    });
    expect(createCall.data.completedAt).toBeInstanceOf(Date);

    // No notification, no email — silent auto-complete (AE5b).
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("task with no predicate → instance pending with assignedByAdminId, notification dispatched (AE5 subset)", async () => {
    stubTaskPredicate("task-1", null);
    const created = {
      id: "inst-1",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      source: null,
      signature: "manual:2026-06-01T00:00:00.000Z",
      completedAt: null,
      assignedByAdminId: "admin-1",
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.taskInstance.create.mockResolvedValueOnce(created);

    const result = await manuallyAssignInstance("task-1", "u1", "admin-1");

    expect(result).toEqual(created);
    // No predicate evaluation when predicateKey is null.
    expect(evaluatePredicateMock).not.toHaveBeenCalled();
    // Still pending → notification fires.
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const createCall = prismaMock.taskInstance.create.mock.calls[0]![0];
    expect(createCall.data.status).toBe("pending");
    expect(createCall.data.assignedByAdminId).toBe("admin-1");
  });

  it("scheduler disabled → throws TasksSchedulerDisabledError, no DB writes", async () => {
    isTasksSchedulerEnabledMock.mockResolvedValueOnce(false);

    await expect(
      manuallyAssignInstance("task-1", "u1", "admin-1"),
    ).rejects.toBeInstanceOf(TasksSchedulerDisabledError);

    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.create).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("missing task definition → throws (the endpoint pre-checks but the lib stays defensive)", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    await expect(
      manuallyAssignInstance("ghost-task", "u1", "admin-1"),
    ).rejects.toThrow(/task not found/i);

    expect(prismaMock.taskInstance.create).not.toHaveBeenCalled();
  });

  it("each call produces a unique signature (timestamps differ within the ISO format)", async () => {
    stubTaskPredicate("task-1", null);
    stubTaskPredicate("task-1", null);
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-1",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      source: null,
      signature: "",
      completedAt: null,
      assignedByAdminId: "admin-1",
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-2",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      source: null,
      signature: "",
      completedAt: null,
      assignedByAdminId: "admin-1",
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await manuallyAssignInstance("task-1", "u1", "admin-1");
    // Advance the wall clock enough that the ISO string changes — Date.now()
    // resolution is 1ms, but the operations themselves take longer than that
    // on most machines; still, make it deterministic by awaiting a tick.
    await new Promise((r) => setTimeout(r, 2));
    await manuallyAssignInstance("task-1", "u1", "admin-1");

    const sig1 = prismaMock.taskInstance.create.mock.calls[0]![0].data.signature;
    const sig2 = prismaMock.taskInstance.create.mock.calls[1]![0].data.signature;
    expect(sig1).toMatch(/^manual:/);
    expect(sig2).toMatch(/^manual:/);
    expect(sig1).not.toBe(sig2);
  });
});

describe("countBackfillTargets", () => {
  it("zero users → 0", async () => {
    prismaMock.user.count.mockResolvedValueOnce(0);

    const count = await countBackfillTargets("task-1");

    expect(count).toBe(0);
    const call = prismaMock.user.count.mock.calls[0]![0];
    expect(call.where).toEqual({
      taskInstances: { none: { taskId: "task-1", status: "pending" } },
    });
  });

  it("200 users, none with an open instance → 200", async () => {
    prismaMock.user.count.mockResolvedValueOnce(200);
    const count = await countBackfillTargets("task-1");
    expect(count).toBe(200);
  });

  it("200 users, 50 with an open instance → 150", async () => {
    prismaMock.user.count.mockResolvedValueOnce(150);
    const count = await countBackfillTargets("task-1");
    expect(count).toBe(150);
  });
});

describe("runBackfillForDefinition", () => {
  /**
   * Helper: stub `task.findUnique` to return a task with the given
   * predicate twice — once for the initial read, once for the
   * between-batches abort-check (which our default fixture only
   * exercises with one batch, but stubbing is cheap and explicit).
   */
  function stubTaskFor(
    taskId: string,
    predicateKey: string | null,
    enabled = true,
  ) {
    prismaMock.task.findUnique.mockImplementation(async () => ({
      id: taskId,
      predicateKey,
      enabled,
    }));
  }

  /**
   * Build a fixture of `n` user ids `u1..un`. The first `matchCount`
   * users match the predicate; the rest don't. `predicateMatchers` is
   * a Set of user ids that should return true from evaluatePredicate.
   */
  function buildUserFixture(n: number, matchCount: number) {
    const users = Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}` }));
    const matchers = new Set(users.slice(0, matchCount).map((u) => u.id));
    return { users, matchers };
  }

  /**
   * Wire the user.findMany cursor pagination + the upsert + the
   * predicate mock so a single backfill run against `users` produces
   * the expected per-row state. The upsert mock returns an instance
   * shaped per `matched ? completed : pending`, simulating the
   * actual Prisma write semantics.
   */
  function wireBatch(
    batchSize: number,
    users: { id: string }[],
    matchers: Set<string>,
  ) {
    // Paginate `users` in `batchSize`-sized slices. The first call
    // has no cursor; subsequent calls carry `cursor: { id: <last id> }`.
    let nextStart = 0;
    prismaMock.user.findMany.mockImplementation(async (args: { take: number; cursor?: { id: string } }) => {
      const start = args.cursor
        ? users.findIndex((u) => u.id === args.cursor!.id) + 1
        : nextStart;
      const slice = users.slice(start, start + args.take);
      nextStart = start + slice.length;
      return slice;
    });

    evaluatePredicateMock.mockImplementation(async (_key: string, userId: string) =>
      matchers.has(userId),
    );

    let instanceCounter = 0;
    prismaMock.taskInstance.upsert.mockImplementation(async (args: {
      where: { taskId_userId_signature: { userId: string } };
      create: {
        userId: string;
        taskId: string;
        status: string;
        source: string | null;
        signature: string;
        completedAt?: Date;
      };
    }) => {
      instanceCounter += 1;
      const userId = args.where.taskId_userId_signature.userId;
      return {
        id: `inst-${instanceCounter}`,
        taskId: args.create.taskId,
        userId,
        status: args.create.status,
        source: args.create.source,
        signature: args.create.signature,
        completedAt: args.create.completedAt ?? null,
        assignedByAdminId: null,
        completedByAdminId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    return { batchSize };
  }

  it("silent mode: 200 users, 50 matching → 200 instances, 50 silent-completed, 0 notifications (AE1)", async () => {
    stubTaskFor("task-1", "avatar_present");
    const { users, matchers } = buildUserFixture(200, 50);
    wireBatch(500, users, matchers);

    const stats = await runBackfillForDefinition("task-1", {
      notify: false,
      enabledAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    expect(stats.totalCreated).toBe(200);
    expect(stats.totalAutoCompleted).toBe(50);
    expect(stats.totalNotified).toBe(0);

    // 200 upserts; each with signature `backfill:<enabledAt iso>`.
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(200);
    for (const call of prismaMock.taskInstance.upsert.mock.calls) {
      expect(call[0].create.signature).toBe(
        "backfill:2026-06-01T10:00:00.000Z",
      );
    }
    // Critical: silent mode means zero notifications fired even for
    // the 150 pending instances. AE1 spells this out.
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("notify mode: same fixture → 200 instances, 50 silent-complete, 150 notifications (AE2)", async () => {
    stubTaskFor("task-1", "avatar_present");
    const { users, matchers } = buildUserFixture(200, 50);
    wireBatch(500, users, matchers);

    const stats = await runBackfillForDefinition("task-1", {
      notify: true,
      enabledAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    expect(stats.totalCreated).toBe(200);
    expect(stats.totalAutoCompleted).toBe(50);
    expect(stats.totalNotified).toBe(150);

    // 150 dispatch calls — only for the pending instances.
    expect(dispatchMock).toHaveBeenCalledTimes(150);
    // The 50 silent-complete users (u1..u50) should NOT appear in any
    // dispatch call payload — that's the entire point of AE2's
    // "silent auto-complete produces no notification" branch.
    const dispatched = new Set(
      dispatchMock.mock.calls.map((c) => c[0].userId),
    );
    for (let i = 1; i <= 50; i += 1) {
      expect(dispatched.has(`u${i}`)).toBe(false);
    }
    for (let i = 51; i <= 200; i += 1) {
      expect(dispatched.has(`u${i}`)).toBe(true);
    }
  });

  it("batching: batchSize=50, 175 users → 4 batches, no missed users, no double-create", async () => {
    stubTaskFor("task-1", null);
    getBackfillBatchSizeMock.mockResolvedValue(50);
    const { users, matchers } = buildUserFixture(175, 0);
    wireBatch(50, users, matchers);

    const stats = await runBackfillForDefinition("task-1", {
      notify: false,
      enabledAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    expect(stats.totalCreated).toBe(175);
    // 4 paginated reads: 50 + 50 + 50 + 25. The fourth comes back
    // short of `batchSize` so the loop exits without a fifth read.
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(4);
    // Verify cursor advancement: each call after the first carries
    // a cursor that's the last user id of the previous slice.
    const calls = prismaMock.user.findMany.mock.calls;
    expect(calls[0]![0].cursor).toBeUndefined();
    expect(calls[1]![0].cursor).toEqual({ id: "u50" });
    expect(calls[2]![0].cursor).toEqual({ id: "u100" });
    expect(calls[3]![0].cursor).toEqual({ id: "u150" });

    // No duplicate create — each user shows up exactly once across the
    // four batches.
    const targetUsers = prismaMock.taskInstance.upsert.mock.calls.map(
      (c) => c[0].where.taskId_userId_signature.userId,
    );
    expect(new Set(targetUsers).size).toBe(175);
  });

  it("aborts cleanly when Task.enabled flips to false between batches", async () => {
    // First two reads return enabled=true (initial + first-batch
    // pre-check). Third read (between-batches pre-check before batch 2)
    // returns enabled=false — the loop must exit before fetching
    // batch 2 users.
    let readCount = 0;
    prismaMock.task.findUnique.mockImplementation(async () => {
      readCount += 1;
      return {
        id: "task-1",
        predicateKey: null,
        enabled: readCount < 3, // first 2 reads: true; third onward: false
      };
    });
    getBackfillBatchSizeMock.mockResolvedValue(50);
    const { users, matchers } = buildUserFixture(120, 0);
    wireBatch(50, users, matchers);

    const stats = await runBackfillForDefinition("task-1", {
      notify: false,
      enabledAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    // Only the first batch (50 users) was processed; the abort check
    // before batch 2 stopped the loop.
    expect(stats.totalCreated).toBe(50);
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    // No rollback per resolved-2026-05-31 — the 50 created instances
    // are kept; we just don't process more.
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(50);
  });

  it("scheduler disabled → returns early with zero stats, no DB writes", async () => {
    isTasksSchedulerEnabledMock.mockResolvedValueOnce(false);

    const stats = await runBackfillForDefinition("task-1", {
      notify: true,
      enabledAt: new Date(),
    });

    expect(stats).toEqual({
      totalCreated: 0,
      totalAutoCompleted: 0,
      totalNotified: 0,
    });
    // logError is called once to record the skip — useful for audit.
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    // Critical: no instance writes, no findMany scans.
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.upsert).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("race: pre-existing backfill row → upsert returns the existing row, no duplicate (idempotent)", async () => {
    stubTaskFor("task-1", null);
    getBackfillBatchSizeMock.mockResolvedValue(50);
    const { users } = buildUserFixture(2, 0);

    // u1 has a pre-existing backfill row (status=completed somehow —
    // simulating the rare retry case). u2 is fresh.
    prismaMock.user.findMany.mockResolvedValueOnce(users);
    prismaMock.user.findMany.mockResolvedValueOnce([]);
    prismaMock.taskInstance.upsert.mockImplementationOnce(async () => ({
      // Returned existing row from the `update: {}` no-op branch —
      // already completed from an earlier retry.
      id: "inst-existing",
      taskId: "task-1",
      userId: "u1",
      status: "completed",
      source: "predicate",
      signature: "backfill:2026-06-01T10:00:00.000Z",
      completedAt: new Date(),
      assignedByAdminId: null,
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    prismaMock.taskInstance.upsert.mockImplementationOnce(async () => ({
      id: "inst-new",
      taskId: "task-1",
      userId: "u2",
      status: "pending",
      source: null,
      signature: "backfill:2026-06-01T10:00:00.000Z",
      completedAt: null,
      assignedByAdminId: null,
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const stats = await runBackfillForDefinition("task-1", {
      notify: false,
      enabledAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    // No P2002 surfaced; both users processed cleanly. The existing
    // completed row was counted as auto-complete because that's what
    // upsert returned (the test verifies the function trusts the
    // upsert return value, which matches Prisma's semantics).
    expect(stats.totalCreated).toBe(2);
    expect(stats.totalAutoCompleted).toBe(1);
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(2);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("missing task → returns zero stats and logs error", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce(null);

    const stats = await runBackfillForDefinition("ghost-task", {
      notify: false,
      enabledAt: new Date(),
    });

    expect(stats).toEqual({
      totalCreated: 0,
      totalAutoCompleted: 0,
      totalNotified: 0,
    });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalled();
  });

  it("task disabled at start (race vs the endpoint flip) → returns zero stats, no scan", async () => {
    prismaMock.task.findUnique.mockResolvedValueOnce({
      id: "task-1",
      predicateKey: null,
      enabled: false,
    });

    const stats = await runBackfillForDefinition("task-1", {
      notify: false,
      enabledAt: new Date(),
    });

    expect(stats.totalCreated).toBe(0);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("swallows per-user errors and continues with the rest of the batch", async () => {
    stubTaskFor("task-1", null);
    getBackfillBatchSizeMock.mockResolvedValue(50);
    const { users } = buildUserFixture(2, 0);
    prismaMock.user.findMany.mockResolvedValueOnce(users);
    prismaMock.user.findMany.mockResolvedValueOnce([]);
    // First user upsert throws; second succeeds.
    prismaMock.taskInstance.upsert.mockRejectedValueOnce(
      new Error("transient DB blip"),
    );
    prismaMock.taskInstance.upsert.mockResolvedValueOnce({
      id: "inst-u2",
      taskId: "task-1",
      userId: "u2",
      status: "pending",
      source: null,
      signature: "backfill:2026-06-01T10:00:00.000Z",
      completedAt: null,
      assignedByAdminId: null,
      completedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const stats = await runBackfillForDefinition("task-1", {
      notify: true,
      enabledAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    expect(stats.totalCreated).toBe(1);
    expect(stats.totalNotified).toBe(1);
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });
});
