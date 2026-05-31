import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks. The handles below re-grab the same object refs after
// the module imports run so test bodies can drive the mocks directly.
vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    task: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/log.server", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendTaskCreatedEmail: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { sendTaskCreatedEmail } from "@/lib/email";
import { logError } from "@/lib/log.server";
import {
  createTaskCreatedNotification,
  dispatchTaskCreatedFor,
  markNotificationsReadForUser,
} from "@/lib/notifications";
import { KNOWN_TEMPLATES, renderFallback } from "@/lib/templates";

const prismaMock = prisma as unknown as {
  notification: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
  task: { findUnique: ReturnType<typeof vi.fn> };
};
const sendTaskCreatedEmailMock = sendTaskCreatedEmail as unknown as ReturnType<
  typeof vi.fn
>;
const logErrorMock = logError as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  prismaMock.notification.create.mockReset();
  prismaMock.notification.findFirst.mockReset();
  prismaMock.notification.updateMany.mockReset();
  prismaMock.user.findUnique.mockReset();
  prismaMock.task.findUnique.mockReset();
  sendTaskCreatedEmailMock.mockReset();
  logErrorMock.mockReset();
});

describe("createTaskCreatedNotification", () => {
  it("writes a Notification row with type=task_created and unread=true", async () => {
    const row = {
      id: "n1",
      userId: "u1",
      type: "task_created",
      taskInstanceId: "inst-1",
      unread: true,
      createdAt: new Date(),
    };
    prismaMock.notification.create.mockResolvedValueOnce(row);

    const result = await createTaskCreatedNotification("u1", "inst-1");

    expect(result).toEqual(row);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    const call = prismaMock.notification.create.mock.calls[0]![0];
    expect(call.data).toEqual({
      userId: "u1",
      type: "task_created",
      taskInstanceId: "inst-1",
      unread: true,
    });
  });

  it("swallows + logs DB errors and returns null", async () => {
    const boom = new Error("DB down");
    prismaMock.notification.create.mockRejectedValueOnce(boom);

    const result = await createTaskCreatedNotification("u1", "inst-1");

    expect(result).toBeNull();
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![0]).toBe(boom);
  });
});

describe("markNotificationsReadForUser", () => {
  it("flips every unread row for the user to read", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 3 });

    const count = await markNotificationsReadForUser("u1");

    expect(count).toBe(3);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledTimes(1);
    const call = prismaMock.notification.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ userId: "u1", unread: true });
    expect(call.data).toEqual({ unread: false });
  });

  it("leaves other users' notifications untouched (scopes by userId)", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 0 });

    await markNotificationsReadForUser("u2");

    const call = prismaMock.notification.updateMany.mock.calls[0]![0];
    expect(call.where.userId).toBe("u2");
    // The where also filters on unread:true so a stranger's read rows
    // are doubly out of reach.
    expect(call.where.unread).toBe(true);
  });

  it("idempotent — running again returns 0 when no unread rows remain", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 0 });
    const second = await markNotificationsReadForUser("u1");
    expect(second).toBe(0);
  });

  it("swallows + logs DB errors and returns 0", async () => {
    const boom = new Error("DB down");
    prismaMock.notification.updateMany.mockRejectedValueOnce(boom);
    const result = await markNotificationsReadForUser("u1");
    expect(result).toBe(0);
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchTaskCreatedFor", () => {
  const instance = { id: "inst-1", userId: "u1", taskId: "t1" };

  function stubNoExistingNotification() {
    prismaMock.notification.findFirst.mockResolvedValueOnce(null);
  }

  function stubNotificationCreated() {
    prismaMock.notification.create.mockResolvedValueOnce({
      id: "n1",
      userId: instance.userId,
      type: "task_created",
      taskInstanceId: instance.id,
      unread: true,
      createdAt: new Date(),
    });
  }

  function stubUserAndTask(opts: {
    email?: string;
    languageId?: string | null;
    title?: string;
    description?: string | null;
    optedOutInDb?: boolean;
  } = {}) {
    // First user.findUnique resolves the opt-out (only called when session
    // didn't pass one in). Second resolves email + languageId.
    if (opts.optedOutInDb !== undefined) {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        taskEmailsOptOut: opts.optedOutInDb,
      });
    }
    prismaMock.user.findUnique.mockResolvedValueOnce({
      email: opts.email ?? "u1@example.com",
      languageId: opts.languageId ?? null,
    });
    prismaMock.task.findUnique.mockResolvedValueOnce({
      title: opts.title ?? "Upload an avatar",
      description: opts.description ?? "Add a picture so your team can recognise you.",
    });
  }

  it("opted out (via session hint) → writes notification, no email", async () => {
    stubNoExistingNotification();
    stubNotificationCreated();

    await dispatchTaskCreatedFor(instance, { taskEmailsOptOut: true });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(sendTaskCreatedEmailMock).not.toHaveBeenCalled();
    // No need to touch User/Task when opted out via session hint.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
  });

  it("opted in (via session hint) → writes notification AND calls email", async () => {
    stubNoExistingNotification();
    stubNotificationCreated();
    stubUserAndTask({
      email: "alice@example.com",
      languageId: "lang-gb-en",
      title: "Pick a language",
      description: "Choose your preferred language on /profile.",
    });

    await dispatchTaskCreatedFor(instance, { taskEmailsOptOut: false });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(sendTaskCreatedEmailMock).toHaveBeenCalledTimes(1);
    const [to, vars, ctx] = sendTaskCreatedEmailMock.mock.calls[0]!;
    expect(to).toBe("alice@example.com");
    expect(vars).toEqual({
      taskTitle: "Pick a language",
      taskDescription: "Choose your preferred language on /profile.",
      // Default APP_URL — we don't set process.env.APP_URL in the test.
      taskUrl: expect.stringMatching(/\/tasks$/),
    });
    expect(ctx).toEqual({ userId: "u1", languageId: "lang-gb-en" });
  });

  it("no session hint → looks up opt-out on the User row; if opted-out, no email", async () => {
    stubNoExistingNotification();
    stubNotificationCreated();
    // User row says opted-out.
    prismaMock.user.findUnique.mockResolvedValueOnce({ taskEmailsOptOut: true });

    await dispatchTaskCreatedFor(instance);

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(sendTaskCreatedEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
  });

  it("no session hint → looks up opt-out on the User row; if opted-in, sends email", async () => {
    stubNoExistingNotification();
    stubNotificationCreated();
    stubUserAndTask({ optedOutInDb: false });

    await dispatchTaskCreatedFor(instance);

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(sendTaskCreatedEmailMock).toHaveBeenCalledTimes(1);
  });

  it("existing notification for the same taskInstanceId → short-circuits (no notification, no email)", async () => {
    prismaMock.notification.findFirst.mockResolvedValueOnce({ id: "n-existing" });

    await dispatchTaskCreatedFor(instance, { taskEmailsOptOut: false });

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(sendTaskCreatedEmailMock).not.toHaveBeenCalled();
    // Importantly: the idempotency query filters by taskInstanceId + type.
    const call = prismaMock.notification.findFirst.mock.calls[0]![0];
    expect(call.where).toEqual({
      taskInstanceId: instance.id,
      type: "task_created",
    });
  });

  it("missing user (race vs delete) → notification still attempted, email skipped", async () => {
    stubNoExistingNotification();
    stubNotificationCreated();
    // user.findUnique resolves to null.
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await dispatchTaskCreatedFor(instance, { taskEmailsOptOut: false });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(sendTaskCreatedEmailMock).not.toHaveBeenCalled();
  });

  it("swallows + logs unexpected errors (fire-and-forget contract)", async () => {
    const boom = new Error("network blip");
    prismaMock.notification.findFirst.mockRejectedValueOnce(boom);

    await dispatchTaskCreatedFor(instance);

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![0]).toBe(boom);
  });
});

describe("task_created template fallback", () => {
  it("appears in KNOWN_TEMPLATES with the documented variables", () => {
    const entry = KNOWN_TEMPLATES.find((t) => t.key === "task_created");
    expect(entry).toBeDefined();
    expect(entry!.variables).toEqual(["taskTitle", "taskDescription", "taskUrl"]);
  });

  it("renders subject + text + html with sample vars (no leftover placeholders)", () => {
    const entry = KNOWN_TEMPLATES.find((t) => t.key === "task_created")!;
    const out = renderFallback("task_created", entry.sampleVars);
    expect(out).not.toBeNull();
    expect(out!.subject).not.toContain("{{");
    expect(out!.text).not.toContain("{{");
    expect(out!.html).not.toBeNull();
    expect(out!.html).not.toContain("{{");
    // The fallback subject mirrors the plan-mandated copy.
    expect(out!.subject).toBe("You have a new task: Upload your profile picture");
  });

  it("HTML body escapes a title containing <script>", () => {
    const out = renderFallback("task_created", {
      taskTitle: '<script>alert("x")</script>',
      taskDescription: "Description",
      taskUrl: "http://localhost:3000/tasks",
    });
    expect(out!.html).toContain("&lt;script&gt;");
    expect(out!.html).not.toContain("<script>");
  });

  it("plain-text body does NOT escape (per CLAUDE.md contract)", () => {
    const out = renderFallback("task_created", {
      taskTitle: "<script>alert('x')</script>",
      taskDescription: "Description",
      taskUrl: "http://localhost:3000/tasks",
    });
    // Raw chars survive because text rendering takes no escaper.
    expect(out!.text).toContain("<script>alert('x')</script>");
    expect(out!.text).not.toContain("&lt;script&gt;");
  });
});
