import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks. Anything referenced inside a factory must live in
// the factory; the handles below re-grab the same refs after the
// imports run so test bodies can drive them.
vi.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
    },
    taskInstance: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    systemSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
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

vi.mock("@/lib/system-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/system-settings")>(
    "@/lib/system-settings",
  );
  return {
    ...actual,
    isTasksSchedulerEnabled: vi.fn(),
    getBackfillBatchSize: vi.fn(),
    getSchedulerUserWindowMs: vi.fn(),
    getTickWindowMs: vi.fn(),
    getOrCreateTickSecret: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  };
});

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import { dispatchTaskCreatedFor } from "@/lib/notifications";
import { evaluatePredicate } from "@/lib/predicates";
import {
  SETTING_KEYS,
  getBackfillBatchSize,
  getOrCreateTickSecret,
  getSchedulerUserWindowMs,
  getSetting,
  getTickWindowMs,
  isTasksSchedulerEnabled,
  setSetting,
  tasksUserLastRunAtKey,
} from "@/lib/system-settings";
import {
  maybeProcessUserTriggers,
  processDueTriggersForUser,
  runGlobalTick,
} from "@/lib/scheduler";
import { POST as tickRoute } from "@/app/api/super-admin/tasks/tick/route";

const prismaMock = prisma as unknown as {
  task: { findMany: ReturnType<typeof vi.fn> };
  taskInstance: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  user: { findMany: ReturnType<typeof vi.fn> };
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};
const logErrorMock = logError as unknown as ReturnType<typeof vi.fn>;
const dispatchMock = dispatchTaskCreatedFor as unknown as ReturnType<typeof vi.fn>;
const evaluatePredicateMock = evaluatePredicate as unknown as ReturnType<typeof vi.fn>;
const isSchedulerOnMock = isTasksSchedulerEnabled as unknown as ReturnType<typeof vi.fn>;
const getBatchSizeMock = getBackfillBatchSize as unknown as ReturnType<typeof vi.fn>;
const getUserWindowMock = getSchedulerUserWindowMs as unknown as ReturnType<typeof vi.fn>;
const getTickWindowMock = getTickWindowMs as unknown as ReturnType<typeof vi.fn>;
const getOrCreateSecretMock = getOrCreateTickSecret as unknown as ReturnType<typeof vi.fn>;
const getSettingMock = getSetting as unknown as ReturnType<typeof vi.fn>;
const setSettingMock = setSetting as unknown as ReturnType<typeof vi.fn>;

const FIXED_NOW = new Date("2026-06-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);

  prismaMock.task.findMany.mockReset();
  prismaMock.taskInstance.findFirst.mockReset();
  prismaMock.taskInstance.findUnique.mockReset();
  prismaMock.taskInstance.create.mockReset();
  prismaMock.taskInstance.upsert.mockReset();
  prismaMock.user.findMany.mockReset();
  prismaMock.systemSetting.findUnique.mockReset();
  prismaMock.systemSetting.findMany.mockReset();
  prismaMock.systemSetting.upsert.mockReset();
  logErrorMock.mockReset();
  dispatchMock.mockReset();
  evaluatePredicateMock.mockReset();
  isSchedulerOnMock.mockReset();
  getBatchSizeMock.mockReset();
  getUserWindowMock.mockReset();
  getTickWindowMock.mockReset();
  getOrCreateSecretMock.mockReset();
  getSettingMock.mockReset();
  setSettingMock.mockReset();

  // Defaults: scheduler on, generous windows, ample batch size.
  isSchedulerOnMock.mockResolvedValue(true);
  getBatchSizeMock.mockResolvedValue(500);
  getUserWindowMock.mockResolvedValue(5 * 60 * 1000);
  getTickWindowMock.mockResolvedValue(5 * 60 * 1000);
  // Default: no prior claim. Tests that exercise the skip-when-fresh
  // branch override this.
  getSettingMock.mockResolvedValue(undefined);
  setSettingMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("maybeProcessUserTriggers", () => {
  it("scheduler disabled → returns early, no claim attempted, no work done", async () => {
    isSchedulerOnMock.mockResolvedValueOnce(false);

    await maybeProcessUserTriggers("u1");

    expect(getSettingMock).not.toHaveBeenCalled();
    expect(setSettingMock).not.toHaveBeenCalled();
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it("window is fresh (last claim 10s ago) → skips work, no claim re-write", async () => {
    const tenSecondsAgo = new Date(FIXED_NOW.getTime() - 10 * 1000).toISOString();
    getSettingMock.mockResolvedValueOnce(tenSecondsAgo);

    await maybeProcessUserTriggers("u1");

    // The skip happens before the work — verify findMany was never called
    // and the claim was NOT re-written (the existing fresh claim stays).
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
    expect(setSettingMock).not.toHaveBeenCalled();
  });

  it("claim is stale → claims window BEFORE processing, then runs", async () => {
    // Claim is from 10 minutes ago — past the 5-minute default window.
    const tenMinutesAgo = new Date(FIXED_NOW.getTime() - 10 * 60 * 1000).toISOString();
    getSettingMock.mockResolvedValueOnce(tenMinutesAgo);
    // No matching definitions → no work after the claim, but the claim
    // still has to happen first.
    prismaMock.task.findMany.mockResolvedValueOnce([]);

    await maybeProcessUserTriggers("u1");

    // Critical ordering: claim happens BEFORE findMany. We can check
    // the call order via vi.mock invocation order.
    expect(setSettingMock).toHaveBeenCalledTimes(1);
    expect(setSettingMock).toHaveBeenCalledWith(
      tasksUserLastRunAtKey("u1"),
      expect.any(String),
    );
    expect(prismaMock.task.findMany).toHaveBeenCalledTimes(1);
    // Claim invocation order must precede findMany.
    expect(setSettingMock.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.task.findMany.mock.invocationCallOrder[0]!,
    );
  });

  it("no prior claim → claims and processes", async () => {
    getSettingMock.mockResolvedValueOnce(undefined);
    prismaMock.task.findMany.mockResolvedValueOnce([]);

    await maybeProcessUserTriggers("u1");

    expect(setSettingMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.findMany).toHaveBeenCalledTimes(1);
  });

  it("swallows + logs errors (fire-and-forget contract)", async () => {
    const boom = new Error("DB exploded");
    getSettingMock.mockRejectedValueOnce(boom);

    await maybeProcessUserTriggers("u1");

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![0]).toBe(boom);
  });
});

describe("processDueTriggersForUser — recurring", () => {
  it("pending instance for same (taskId, userId) exists → no new instance (AE7)", async () => {
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: null,
        triggers: [
          {
            id: "trig-1",
            kind: "recurring",
            intervalDays: 30,
            dateList: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
    ]);
    // Pending instance exists — blocks recurring per KTD7 / R9 revised.
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce({
      id: "existing-pending",
    });

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(0);
    expect(stats.notificationsFired).toBe(0);
    expect(prismaMock.taskInstance.create).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("recurring with no prior instance + interval NOT elapsed since trigger.createdAt → no instance", async () => {
    // Trigger was created 5 days ago; interval is 30 → not yet due.
    const fiveDaysAgo = new Date(FIXED_NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: null,
        triggers: [
          {
            id: "trig-1",
            kind: "recurring",
            intervalDays: 30,
            dateList: null,
            createdAt: fiveDaysAgo,
          },
        ],
      },
    ]);
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // no pending
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // no completed

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(0);
    expect(prismaMock.taskInstance.create).not.toHaveBeenCalled();
  });

  it("recurring with no prior instance + interval elapsed since trigger.createdAt → creates with signature recurring:<iso>, predicate evaluated", async () => {
    // Trigger created 40 days ago; interval 30 → due.
    const fortyDaysAgo = new Date(FIXED_NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: "email_verified",
        triggers: [
          {
            id: "trig-1",
            kind: "recurring",
            intervalDays: 30,
            dateList: null,
            createdAt: fortyDaysAgo,
          },
        ],
      },
    ]);
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // no pending
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // no completed
    evaluatePredicateMock.mockResolvedValueOnce(false); // not matched

    const createdInstance = {
      id: "inst-new",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      signature: `recurring:${FIXED_NOW.toISOString()}`,
    };
    prismaMock.taskInstance.create.mockResolvedValueOnce(createdInstance);

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(1);
    expect(stats.notificationsFired).toBe(1);

    expect(prismaMock.taskInstance.create).toHaveBeenCalledTimes(1);
    const createCall = prismaMock.taskInstance.create.mock.calls[0]![0];
    expect(createCall.data).toMatchObject({
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      source: null,
      signature: `recurring:${FIXED_NOW.toISOString()}`,
    });
    expect(evaluatePredicateMock).toHaveBeenCalledWith("email_verified", "u1");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock.mock.calls[0]![0]).toEqual({
      id: "inst-new",
      userId: "u1",
      taskId: "task-1",
    });
  });

  it("recurring with previous completed > intervalDays ago → new instance created", async () => {
    const fortyDaysAgo = new Date(FIXED_NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: null, // no predicate -> always pending + dispatch
        triggers: [
          {
            id: "trig-1",
            kind: "recurring",
            intervalDays: 30,
            dateList: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
    ]);
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // no pending
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce({
      completedAt: fortyDaysAgo,
    });
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-cycle-2",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      signature: `recurring:${FIXED_NOW.toISOString()}`,
    });

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(1);
    expect(stats.notificationsFired).toBe(1);
    expect(prismaMock.taskInstance.create).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("recurring with matching predicate → instance created completed silently, no dispatch", async () => {
    const fortyDaysAgo = new Date(FIXED_NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: "avatar_present",
        triggers: [
          {
            id: "trig-1",
            kind: "recurring",
            intervalDays: 30,
            dateList: null,
            createdAt: fortyDaysAgo,
          },
        ],
      },
    ]);
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // pending
    prismaMock.taskInstance.findFirst.mockResolvedValueOnce(null); // completed
    evaluatePredicateMock.mockResolvedValueOnce(true);
    prismaMock.taskInstance.create.mockResolvedValueOnce({
      id: "inst-auto",
      taskId: "task-1",
      userId: "u1",
      status: "completed",
      signature: `recurring:${FIXED_NOW.toISOString()}`,
    });

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(1);
    expect(stats.notificationsFired).toBe(0);
    const createCall = prismaMock.taskInstance.create.mock.calls[0]![0];
    expect(createCall.data).toMatchObject({
      status: "completed",
      source: "predicate",
    });
    expect(createCall.data.completedAt).toBeInstanceOf(Date);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});

describe("processDueTriggersForUser — specific_date", () => {
  it("date == today (UTC) → instance created with signature specific-date:<YYYY-MM-DD>", async () => {
    const today = FIXED_NOW.toISOString().slice(0, 10); // "2026-06-01"
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: null,
        triggers: [
          {
            id: "trig-1",
            kind: "specific_date",
            intervalDays: null,
            dateList: today,
            createdAt: new Date("2026-01-01"),
          },
        ],
      },
    ]);
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce(null); // not yet created
    prismaMock.taskInstance.upsert.mockResolvedValueOnce({
      id: "inst-date",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      signature: `specific-date:${today}`,
    });

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(1);
    expect(stats.notificationsFired).toBe(1);
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = prismaMock.taskInstance.upsert.mock.calls[0]![0];
    expect(upsertCall.where).toEqual({
      taskId_userId_signature: {
        taskId: "task-1",
        userId: "u1",
        signature: `specific-date:${today}`,
      },
    });
    expect(upsertCall.create).toMatchObject({
      status: "pending",
      signature: `specific-date:${today}`,
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("date in the future → no instance created", async () => {
    const future = "2099-12-31";
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: null,
        triggers: [
          {
            id: "trig-1",
            kind: "specific_date",
            intervalDays: null,
            dateList: future,
            createdAt: new Date("2026-01-01"),
          },
        ],
      },
    ]);

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(0);
    expect(prismaMock.taskInstance.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.taskInstance.upsert).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("same date processed twice → second call short-circuits via existing lookup (no upsert)", async () => {
    const today = FIXED_NOW.toISOString().slice(0, 10);
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        predicateKey: null,
        triggers: [
          {
            id: "trig-1",
            kind: "specific_date",
            intervalDays: null,
            dateList: today,
            createdAt: new Date("2026-01-01"),
          },
        ],
      },
    ]);

    // First pass: no existing instance → upsert creates it.
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce(null);
    prismaMock.taskInstance.upsert.mockResolvedValueOnce({
      id: "inst-date",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      signature: `specific-date:${today}`,
    });

    const firstStats = await processDueTriggersForUser("u1");
    expect(firstStats.instancesCreated).toBe(1);

    // Second pass: pre-check finds the existing instance → upsert never called.
    prismaMock.taskInstance.findUnique.mockResolvedValueOnce({
      id: "inst-date",
    });

    const secondStats = await processDueTriggersForUser("u1");
    expect(secondStats.instancesCreated).toBe(0);
    expect(secondStats.notificationsFired).toBe(0);
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(1); // only the first call
  });

  it("multiple dates in dateList → one instance per due date", async () => {
    const yesterday = "2026-05-31";
    const today = "2026-06-01";
    const tomorrow = "2026-06-02";
    prismaMock.task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        predicateKey: null,
        triggers: [
          {
            id: "trig-1",
            kind: "specific_date",
            intervalDays: null,
            dateList: `${yesterday}\n${today}\n${tomorrow}`,
            createdAt: new Date("2026-01-01"),
          },
        ],
      },
    ]);
    // 2 due dates -> 2 findUnique calls, both null, 2 upserts.
    prismaMock.taskInstance.findUnique.mockResolvedValue(null);
    prismaMock.taskInstance.upsert.mockResolvedValue({
      id: "inst-x",
      taskId: "task-1",
      userId: "u1",
      status: "pending",
      signature: "specific-date:placeholder",
    });

    const stats = await processDueTriggersForUser("u1");

    expect(stats.instancesCreated).toBe(2);
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(2);
    // Future date never queried.
    const signatures = prismaMock.taskInstance.upsert.mock.calls.map(
      (c) => c[0].where.taskId_userId_signature.signature,
    );
    expect(signatures).toEqual(
      expect.arrayContaining([
        `specific-date:${yesterday}`,
        `specific-date:${today}`,
      ]),
    );
    expect(signatures).not.toContain(`specific-date:${tomorrow}`);
  });
});

describe("runGlobalTick", () => {
  it("scheduler disabled → returns { status: 'scheduler_disabled' }, no work done", async () => {
    isSchedulerOnMock.mockResolvedValueOnce(false);

    const result = await runGlobalTick();

    expect(result).toEqual({ status: "scheduler_disabled" });
    // Critical: no claim attempt, no user scan.
    expect(getSettingMock).not.toHaveBeenCalled();
    expect(setSettingMock).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("claim window active (last tick 10s ago) → tick_skipped, no scan", async () => {
    const tenSecondsAgo = new Date(FIXED_NOW.getTime() - 10 * 1000).toISOString();
    getSettingMock.mockResolvedValueOnce(tenSecondsAgo);

    const result = await runGlobalTick();

    expect(result).toEqual({
      status: "tick_skipped",
      reason: "window_active",
    });
    expect(setSettingMock).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("10 users × 2 specific-date triggers all due today → 20 instances created", async () => {
    const today = FIXED_NOW.toISOString().slice(0, 10);
    // No prior claim.
    getSettingMock.mockResolvedValueOnce(undefined);
    // 10 users, then empty page to stop.
    const users = Array.from({ length: 10 }, (_, i) => ({ id: `u${i + 1}` }));
    prismaMock.user.findMany.mockResolvedValueOnce(users);
    prismaMock.user.findMany.mockResolvedValueOnce([]);

    // Same definition shape for every per-user call.
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-A",
        predicateKey: null,
        triggers: [
          {
            id: "trig-A",
            kind: "specific_date",
            intervalDays: null,
            dateList: today,
            createdAt: new Date("2026-01-01"),
          },
        ],
      },
      {
        id: "task-B",
        predicateKey: null,
        triggers: [
          {
            id: "trig-B",
            kind: "specific_date",
            intervalDays: null,
            dateList: today,
            createdAt: new Date("2026-01-01"),
          },
        ],
      },
    ]);
    // No pre-existing instance for any (user, task, date) triple.
    prismaMock.taskInstance.findUnique.mockResolvedValue(null);
    // Each upsert returns a freshly-created pending instance.
    let upsertCount = 0;
    prismaMock.taskInstance.upsert.mockImplementation(async (args: {
      create: { taskId: string; userId: string; signature: string };
    }) => {
      upsertCount += 1;
      return {
        id: `inst-${upsertCount}`,
        taskId: args.create.taskId,
        userId: args.create.userId,
        status: "pending",
        signature: args.create.signature,
      };
    });

    const result = await runGlobalTick();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.usersProcessed).toBe(10);
      expect(result.instancesCreated).toBe(20);
      expect(result.notificationsFired).toBe(20);
    }
    expect(prismaMock.taskInstance.upsert).toHaveBeenCalledTimes(20);
    expect(dispatchMock).toHaveBeenCalledTimes(20);
  });

  it("re-running immediately → window_active short-circuit (covers AE8 idempotency)", async () => {
    // First call: claim is set; we don't actually need to walk users.
    getSettingMock.mockResolvedValueOnce(undefined); // claim absent
    prismaMock.user.findMany.mockResolvedValueOnce([]); // empty user page exits cleanly

    const first = await runGlobalTick();
    expect(first.status).toBe("ok");
    expect(setSettingMock).toHaveBeenCalledWith(
      SETTING_KEYS.tasksTickLastRunAt,
      expect.any(String),
    );
    // Capture the just-set claim — the second call's getSetting must return it.
    const claimSet = setSettingMock.mock.calls[0]![1] as string;

    // Second call: claim window is active (the claim we just set).
    getSettingMock.mockResolvedValueOnce(claimSet);
    setSettingMock.mockClear();
    prismaMock.user.findMany.mockClear();

    const second = await runGlobalTick();
    expect(second).toEqual({
      status: "tick_skipped",
      reason: "window_active",
    });
    // No new claim write, no user scan on the second call.
    expect(setSettingMock).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/super-admin/tasks/tick endpoint", () => {
  function makeRequest({
    secret,
    body,
  }: { secret?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret !== undefined) headers["x-tick-secret"] = secret;
    return new Request("http://localhost/api/super-admin/tasks/tick", {
      method: "POST",
      headers,
      body: body === undefined ? "{}" : JSON.stringify(body),
    });
  }

  it("missing X-Tick-Secret → 401 INVALID_TICK_SECRET", async () => {
    getOrCreateSecretMock.mockResolvedValueOnce("a".repeat(64));

    const res = await tickRoute(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: "Invalid tick secret",
      code: "INVALID_TICK_SECRET",
    });
    // Confirm the scheduler was never invoked.
    expect(isSchedulerOnMock).not.toHaveBeenCalled();
  });

  it("wrong X-Tick-Secret → 401", async () => {
    getOrCreateSecretMock.mockResolvedValueOnce("expected-secret-value");

    const res = await tickRoute(makeRequest({ secret: "wrong-secret-value!" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("INVALID_TICK_SECRET");
  });

  it("correct secret + fresh window → 200 with stats", async () => {
    const SECRET = "x".repeat(64);
    getOrCreateSecretMock.mockResolvedValueOnce(SECRET);
    // No prior tick claim.
    getSettingMock.mockResolvedValueOnce(undefined);
    // No users to walk → trivial successful tick.
    prismaMock.user.findMany.mockResolvedValueOnce([]);

    const res = await tickRoute(makeRequest({ secret: SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: "ok",
      usersProcessed: 0,
      instancesCreated: 0,
      notificationsFired: 0,
    });
  });

  it("correct secret + claimed window → 202 with tick_skipped", async () => {
    const SECRET = "x".repeat(64);
    getOrCreateSecretMock.mockResolvedValueOnce(SECRET);
    // Active claim (10s ago).
    const tenSecondsAgo = new Date(FIXED_NOW.getTime() - 10 * 1000).toISOString();
    getSettingMock.mockResolvedValueOnce(tenSecondsAgo);

    const res = await tickRoute(makeRequest({ secret: SECRET }));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({
      status: "tick_skipped",
      reason: "window_active",
    });
  });

  it("scheduler disabled → 200 with scheduler_disabled", async () => {
    const SECRET = "x".repeat(64);
    getOrCreateSecretMock.mockResolvedValueOnce(SECRET);
    isSchedulerOnMock.mockResolvedValueOnce(false);

    const res = await tickRoute(makeRequest({ secret: SECRET }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "scheduler_disabled" });
  });

  it("body with extra field → 400 (strict schema)", async () => {
    const SECRET = "x".repeat(64);
    getOrCreateSecretMock.mockResolvedValueOnce(SECRET);

    const res = await tickRoute(
      makeRequest({ secret: SECRET, body: { rogue: true } }),
    );

    expect(res.status).toBe(400);
  });

  it("rejects when provided secret differs only in length (constant-time guard)", async () => {
    getOrCreateSecretMock.mockResolvedValueOnce("a".repeat(64));

    const res = await tickRoute(
      makeRequest({ secret: "a".repeat(60) }), // shorter
    );

    expect(res.status).toBe(401);
  });
});
