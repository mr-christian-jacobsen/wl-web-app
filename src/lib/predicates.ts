/**
 * Predicate registry — the engineering-maintained catalog of
 * auto-complete checks task definitions can opt into. See
 * `docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md`
 * (KTD2 + U2) for the design.
 *
 * Adding a new predicate:
 *   1. Pick a stable key (snake_case, e.g. `language_set`).
 *   2. Append an entry to `KNOWN_PREDICATES` with a clear `name`
 *      and `description` (surfaced in the admin task editor's
 *      predicate dropdown), an optional `deepLinkPath` (rendered
 *      on the `/tasks` row when present), and an `evaluate`
 *      closure that returns `true` when the user satisfies the
 *      predicate.
 *
 * The registry itself is intentionally Prisma-free at the module
 * level — each `evaluate` closure owns its own DB call so the
 * surface stays a typed const tuple that can be imported from any
 * runtime (including the client for label rendering).
 *
 * v1 floor: `avatar_present`, `email_verified`, `language_set`.
 * `name_set` is intentionally absent because `signupSchema`
 * already enforces a non-empty `name` (Zod `min(1)`), so the
 * predicate would be structurally always-true. See KTD2 in the
 * plan.
 */

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";

export type PredicateDef = {
  /** Stable identifier, e.g. `avatar_present`. */
  key: string;
  /** Short admin-facing label, e.g. "Profile picture is set". */
  name: string;
  /** Longer hint shown next to the dropdown choice. */
  description: string;
  /** Where the user should go to satisfy the predicate, if any. */
  deepLinkPath?: string;
  /** Returns `true` when the user currently satisfies the check. */
  evaluate: (userId: string) => Promise<boolean>;
};

export const KNOWN_PREDICATES = [
  {
    key: "avatar_present",
    name: "Profile picture is set",
    description: "True once the user has uploaded an avatar on /profile.",
    deepLinkPath: "/profile",
    async evaluate(userId: string): Promise<boolean> {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      });
      return row?.avatarUrl != null;
    },
  },
  {
    key: "email_verified",
    name: "Email address is verified",
    description: "True once the user has clicked the verification link in their welcome email.",
    async evaluate(userId: string): Promise<boolean> {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      });
      return row?.emailVerifiedAt != null;
    },
  },
  {
    key: "language_set",
    name: "Preferred language is chosen",
    description: "True once the user has picked a preferred language on /profile.",
    deepLinkPath: "/profile",
    async evaluate(userId: string): Promise<boolean> {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { languageId: true },
      });
      return row?.languageId != null;
    },
  },
] as const satisfies ReadonlyArray<PredicateDef>;

export type KnownPredicateKey = (typeof KNOWN_PREDICATES)[number]["key"];

const PREDICATE_BY_KEY: ReadonlyMap<string, PredicateDef> = new Map(
  KNOWN_PREDICATES.map((p) => [p.key, p]),
);

/** Lookup helper — returns undefined for unknown keys. */
export function getPredicate(key: string): PredicateDef | undefined {
  return PREDICATE_BY_KEY.get(key);
}

/**
 * Run a single predicate against a user. Throws when the key is
 * not in the registry — callers should validate against
 * `KnownPredicateKey` at the boundary; an unknown key here is a
 * programmer error, not a runtime data condition.
 */
export async function evaluatePredicate(
  key: string,
  userId: string,
): Promise<boolean> {
  const def = PREDICATE_BY_KEY.get(key);
  if (!def) {
    throw new Error(`Unknown predicate key: ${key}`);
  }
  return def.evaluate(userId);
}

/**
 * Re-evaluate every pending `TaskInstance` for `userId` whose
 * task carries a predicate, and silently complete the matches.
 *
 * Contract:
 *   - Fire-and-forget. Action handlers invoke this as
 *     `void reevaluatePendingInstancesForUser(userId)` after the
 *     state-changing write commits. Failures MUST NOT bubble up
 *     to the request handler — they're caught + logged here.
 *   - Auto-complete only. Matches flip to
 *     `status: 'completed', source: 'predicate', completedAt: now`.
 *     This function never creates a Notification row — R11.
 *   - Idempotent. Already-completed instances are filtered out by
 *     the `status: 'pending'` `where` clause; re-running on a
 *     stable user state is a no-op.
 *   - Unknown predicate keys are skipped (logged as a warning via
 *     the surrounding try/catch) rather than crashing the batch.
 *
 * Pattern reference: `src/lib/log.prune.ts` `maybePruneLogEntries`
 * — same swallow-and-log contract.
 */
export async function reevaluatePendingInstancesForUser(
  userId: string,
): Promise<void> {
  try {
    const pending = await prisma.taskInstance.findMany({
      where: {
        userId,
        status: "pending",
        task: { predicateKey: { not: null } },
      },
      select: {
        id: true,
        task: { select: { predicateKey: true } },
      },
    });

    if (pending.length === 0) return;

    const matchedIds: string[] = [];
    for (const inst of pending) {
      const key = inst.task.predicateKey;
      if (!key) continue;
      const def = PREDICATE_BY_KEY.get(key);
      if (!def) continue; // Unknown key — leave the instance alone.
      const matches = await def.evaluate(userId);
      if (matches) matchedIds.push(inst.id);
    }

    if (matchedIds.length === 0) return;

    // One UPDATE per batch — the unique-key constraint on
    // (taskId, userId, signature) is unaffected by status flips.
    await prisma.taskInstance.updateMany({
      where: { id: { in: matchedIds }, status: "pending" },
      data: {
        status: "completed",
        source: "predicate",
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await logError(err, {
      context: { feature: "predicates.reevaluate", userId },
      userId,
    });
  }
}
