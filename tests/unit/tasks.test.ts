import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above the imports — anything the factories
// reference has to live inside them. The handles after the imports
// re-grab the same object refs so the test bodies can drive the mocks.
vi.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    taskInstance: {
      create: vi.fn(),
      update: vi.fn(),
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
}));

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import { dispatchTaskCreatedFor } from "@/lib/notifications";
import { evaluatePredicate } from "@/lib/predicates";
import { isTasksSchedulerEnabled } from "@/lib/system-settings";
import {
  TasksSchedulerDisabledError,
  createInstancesForSignup,
  manuallyAssignInstance,
} from "@/lib/tasks";

const prismaMock = prisma as unknown as {
  task: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  taskInstance: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const logErrorMock = logError as unknown as ReturnType<typeof vi.fn>;
const dispatchMock = dispatchTaskCreatedFor as unknown as ReturnType<typeof vi.fn>;
const evaluatePredicateMock = evaluatePredicate as unknown as ReturnType<typeof vi.fn>;
const isTasksSchedulerEnabledMock = isTasksSchedulerEnabled as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prismaMock.task.findMany.mockReset();
  prismaMock.task.findUnique.mockReset();
  prismaMock.taskInstance.create.mockReset();
  prismaMock.taskInstance.update.mockReset();
  logErrorMock.mockReset();
  dispatchMock.mockReset();
  evaluatePredicateMock.mockReset();
  isTasksSchedulerEnabledMock.mockReset();
  // Default: scheduler is on. Individual tests flip this to false.
  isTasksSchedulerEnabledMock.mockResolvedValue(true);
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
