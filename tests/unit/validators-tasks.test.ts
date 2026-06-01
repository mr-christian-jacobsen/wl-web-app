import { describe, expect, it } from "vitest";

import {
  createTaskSchema,
  instanceListQuerySchema,
  taskTriggerSchema,
  updateTaskSchema,
} from "@/lib/validators";

/**
 * Focused validators test for the U5/U7/U8 task surface. Kept as its
 * own file rather than appended to `validators.test.ts` because the
 * schemas have a discriminated-union shape that warrants per-variant
 * coverage.
 *
 * The companion `enableTaskSchema` and `assignTaskInstanceSchema`
 * tests already live in `validators.test.ts` (`enableTaskSchema`)
 * and the U4/U5 test files — only the U7 schemas land here.
 */

describe("taskTriggerSchema", () => {
  it("accepts a valid signup trigger with no sub-fields", () => {
    expect(taskTriggerSchema.safeParse({ kind: "signup" }).success).toBe(true);
  });

  it("accepts a valid manual_assign trigger with no sub-fields", () => {
    expect(taskTriggerSchema.safeParse({ kind: "manual_assign" }).success).toBe(true);
  });

  it("accepts a valid recurring trigger with positive intervalDays", () => {
    const r = taskTriggerSchema.safeParse({ kind: "recurring", intervalDays: 7 });
    expect(r.success).toBe(true);
  });

  it("rejects a recurring trigger with intervalDays = 0", () => {
    expect(
      taskTriggerSchema.safeParse({ kind: "recurring", intervalDays: 0 }).success,
    ).toBe(false);
  });

  it("rejects a recurring trigger with negative intervalDays", () => {
    expect(
      taskTriggerSchema.safeParse({ kind: "recurring", intervalDays: -3 }).success,
    ).toBe(false);
  });

  it("rejects a recurring trigger with non-integer intervalDays", () => {
    expect(
      taskTriggerSchema.safeParse({ kind: "recurring", intervalDays: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects a recurring trigger missing intervalDays", () => {
    expect(taskTriggerSchema.safeParse({ kind: "recurring" }).success).toBe(false);
  });

  it("rejects a recurring trigger with stray dates field (.strict())", () => {
    expect(
      taskTriggerSchema.safeParse({
        kind: "recurring",
        intervalDays: 7,
        dates: ["2026-06-01"],
      }).success,
    ).toBe(false);
  });

  it("accepts a specific_date trigger with at least one valid date", () => {
    const r = taskTriggerSchema.safeParse({
      kind: "specific_date",
      dates: ["2026-06-01"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a specific_date trigger with multiple valid dates", () => {
    const r = taskTriggerSchema.safeParse({
      kind: "specific_date",
      dates: ["2026-06-01", "2026-07-15", "2026-12-31"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a specific_date trigger with empty dates array", () => {
    expect(
      taskTriggerSchema.safeParse({ kind: "specific_date", dates: [] }).success,
    ).toBe(false);
  });

  it("rejects a specific_date trigger with malformed date strings", () => {
    expect(
      taskTriggerSchema.safeParse({
        kind: "specific_date",
        dates: ["06/01/2026"],
      }).success,
    ).toBe(false);
    expect(
      taskTriggerSchema.safeParse({
        kind: "specific_date",
        dates: ["2026-6-1"], // missing zero-padding
      }).success,
    ).toBe(false);
  });

  it("rejects a specific_date trigger with stray intervalDays field (.strict())", () => {
    expect(
      taskTriggerSchema.safeParse({
        kind: "specific_date",
        dates: ["2026-06-01"],
        intervalDays: 7,
      }).success,
    ).toBe(false);
  });

  it("rejects a signup trigger with stray intervalDays field (.strict())", () => {
    expect(
      taskTriggerSchema.safeParse({ kind: "signup", intervalDays: 7 }).success,
    ).toBe(false);
  });

  it("rejects an unknown trigger kind", () => {
    expect(
      taskTriggerSchema.safeParse({ kind: "on_login" }).success,
    ).toBe(false);
  });

  it("rejects a trigger with no kind", () => {
    expect(taskTriggerSchema.safeParse({}).success).toBe(false);
  });
});

describe("createTaskSchema", () => {
  it("accepts a minimal valid task (title + one signup trigger)", () => {
    const r = createTaskSchema.safeParse({
      title: "Upload avatar",
      triggers: [{ kind: "signup" }],
    });
    expect(r.success).toBe(true);
  });

  it("trims and requires a non-empty title", () => {
    expect(
      createTaskSchema.safeParse({
        title: "   ",
        triggers: [{ kind: "signup" }],
      }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({
        title: "",
        triggers: [{ kind: "signup" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty triggers array", () => {
    expect(
      createTaskSchema.safeParse({
        title: "Upload avatar",
        triggers: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a missing triggers field", () => {
    expect(
      createTaskSchema.safeParse({
        title: "Upload avatar",
      }).success,
    ).toBe(false);
  });

  it("accepts a known predicate key from KNOWN_PREDICATES", () => {
    const r = createTaskSchema.safeParse({
      title: "Upload avatar",
      predicateKey: "avatar_present",
      triggers: [{ kind: "signup" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an explicit null predicateKey (manual sentinel)", () => {
    const r = createTaskSchema.safeParse({
      title: "Manual ask",
      predicateKey: null,
      triggers: [{ kind: "manual_assign" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an omitted predicateKey (defaults to undefined → null in DB)", () => {
    const r = createTaskSchema.safeParse({
      title: "Manual ask",
      triggers: [{ kind: "manual_assign" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown predicateKey", () => {
    expect(
      createTaskSchema.safeParse({
        title: "X",
        predicateKey: "not_in_registry",
        triggers: [{ kind: "signup" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a trigger whose discriminated shape is invalid", () => {
    expect(
      createTaskSchema.safeParse({
        title: "X",
        triggers: [{ kind: "recurring", intervalDays: 0 }],
      }).success,
    ).toBe(false);
  });

  it("accepts a multi-trigger task combining all four shapes", () => {
    const r = createTaskSchema.safeParse({
      title: "Mega task",
      triggers: [
        { kind: "signup" },
        { kind: "manual_assign" },
        { kind: "recurring", intervalDays: 30 },
        { kind: "specific_date", dates: ["2026-06-01", "2026-12-25"] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown extra top-level fields (.strict())", () => {
    expect(
      createTaskSchema.safeParse({
        title: "X",
        triggers: [{ kind: "signup" }],
        force: true,
      }).success,
    ).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("accepts a partial update with only title", () => {
    expect(updateTaskSchema.safeParse({ title: "Renamed" }).success).toBe(true);
  });

  it("accepts a partial update with only enabled=false", () => {
    expect(updateTaskSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it("accepts a partial update with only predicateKey=null", () => {
    expect(updateTaskSchema.safeParse({ predicateKey: null }).success).toBe(true);
  });

  it("accepts a partial update with only a new triggers list", () => {
    expect(
      updateTaskSchema.safeParse({
        triggers: [{ kind: "recurring", intervalDays: 14 }],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty-object update (no field to update)", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a triggers update with zero triggers (still must be non-empty)", () => {
    expect(updateTaskSchema.safeParse({ triggers: [] }).success).toBe(false);
  });

  it("rejects an unknown predicateKey in a partial update", () => {
    expect(
      updateTaskSchema.safeParse({ predicateKey: "fictional" }).success,
    ).toBe(false);
  });

  it("rejects unknown extra fields (.strict())", () => {
    expect(
      updateTaskSchema.safeParse({ title: "X", force: true }).success,
    ).toBe(false);
  });
});

describe("instanceListQuerySchema", () => {
  it("accepts an empty object and defaults limit to 50", () => {
    const r = instanceListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
    }
  });

  it("accepts all filters set", () => {
    const r = instanceListQuerySchema.safeParse({
      userId: "u1",
      taskId: "t1",
      status: "pending",
      cursor: "2026-05-31T10:00:00.000Z_i1",
      limit: 25,
    });
    expect(r.success).toBe(true);
  });

  it("coerces a numeric string limit into a number", () => {
    // The URL `?limit=20` arrives as a string; z.coerce makes the
    // schema robust at the boundary.
    const r = instanceListQuerySchema.safeParse({ limit: "20" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(20);
    }
  });

  it("rejects an unknown status value", () => {
    expect(
      instanceListQuerySchema.safeParse({ status: "archived" }).success,
    ).toBe(false);
  });

  it("rejects a limit below 1", () => {
    expect(instanceListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(instanceListQuerySchema.safeParse({ limit: -5 }).success).toBe(false);
  });

  it("rejects a limit above 100", () => {
    expect(instanceListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(instanceListQuerySchema.safeParse({ limit: 9999 }).success).toBe(false);
  });

  it("accepts the boundary values 1 and 100", () => {
    expect(instanceListQuerySchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(instanceListQuerySchema.safeParse({ limit: 100 }).success).toBe(true);
  });

  it("rejects a non-integer limit", () => {
    expect(instanceListQuerySchema.safeParse({ limit: 5.5 }).success).toBe(false);
  });

  it("rejects unknown extra fields (.strict())", () => {
    expect(
      instanceListQuerySchema.safeParse({ status: "pending", foo: "bar" })
        .success,
    ).toBe(false);
  });

  it("rejects an empty-string userId (validator trims to empty → min(1))", () => {
    expect(instanceListQuerySchema.safeParse({ userId: "   " }).success).toBe(false);
  });
});
