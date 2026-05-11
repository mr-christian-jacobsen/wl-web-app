import { prisma } from "@/lib/db";
import { SETTING_KEYS, getLogRetention, getSetting, setSetting } from "@/lib/system-settings";

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export type PruneResult = {
  error: number;
  warning: number;
  info: number;
  total: number;
};

/**
 * Delete log entries older than their level's retention window. A retention
 * value of 0 means "never prune this level" — useful for keeping every error
 * forever while letting info/warnings turn over.
 */
export async function pruneLogEntries(): Promise<PruneResult> {
  const retention = await getLogRetention();
  const result: PruneResult = { error: 0, warning: 0, info: 0, total: 0 };

  for (const level of ["error", "warning", "info"] as const) {
    const days = retention[level];
    if (days <= 0) continue;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.logEntry.deleteMany({
      where: { level, lastOccurredAt: { lt: cutoff } },
    });
    result[level] = count;
    result.total += count;
  }

  await setSetting(SETTING_KEYS.logLastPrunedAt, new Date().toISOString());
  return result;
}

/**
 * Run `pruneLogEntries` at most once per `PRUNE_INTERVAL_MS`. Called
 * fire-and-forget from `writeLogEntry` so the system is self-maintaining
 * without an external scheduler. Errors are swallowed: a prune failure must
 * never break the write path.
 */
export async function maybePruneLogEntries(): Promise<void> {
  try {
    const last = await getSetting(SETTING_KEYS.logLastPrunedAt);
    if (last) {
      const lastMs = Date.parse(last);
      if (Number.isFinite(lastMs) && Date.now() - lastMs < PRUNE_INTERVAL_MS) return;
    }
    // Claim the window before doing the work so concurrent writes don't
    // double-prune. setSetting is upsert + last-writer-wins which is good
    // enough — we can tolerate a brief overlap.
    await setSetting(SETTING_KEYS.logLastPrunedAt, new Date().toISOString());
    await pruneLogEntries();
  } catch (err) {
    console.error("[log] background prune failed", err);
  }
}
