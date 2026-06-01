import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

/**
 * Keys we store/edit through /super-admin/system-settings. The DB row, when
 * present, takes precedence over the corresponding env var so admin edits
 * persist across restarts without touching .env.
 */
export const SETTING_KEYS = {
  smtpHost: "smtp.host",
  smtpPort: "smtp.port",
  smtpUser: "smtp.user",
  smtpPass: "smtp.pass",
  smtpFrom: "smtp.from",
  logRetentionErrorDays: "log.retention.errorDays",
  logRetentionWarningDays: "log.retention.warningDays",
  logRetentionInfoDays: "log.retention.infoDays",
  logLastPrunedAt: "log.lastPrunedAt",
  // Auto-translate provider config (see src/lib/translate-provider.ts).
  // Provider is "anthropic" | "openai" | "deepl"; api keys are stored as
  // secrets; model values are free-form strings so admins can flip
  // between e.g. claude-haiku-4-5 and gpt-4o-mini without a code change.
  // DeepL doesn't have models — the free/pro endpoint is auto-detected
  // from the key suffix (DeepL Free keys end with `:fx`).
  translateProvider: "translate.provider",
  translateAnthropicApiKey: "translate.anthropic.apiKey",
  translateAnthropicModel: "translate.anthropic.model",
  translateOpenaiApiKey: "translate.openai.apiKey",
  translateOpenaiModel: "translate.openai.model",
  translateDeeplApiKey: "translate.deepl.apiKey",
  // Tasks subsystem operational knobs (KTD8 in
  // docs/plans/2026-05-31-001-feat-tasks-and-notifications-plan.md).
  // `tasks.scheduler.enabled` is the runtime kill switch threaded as
  // the first short-circuit in every dispatch entry point. Default `true`.
  tasksSchedulerEnabled: "tasks.scheduler.enabled",
  // Per-batch user count during backfill-on-enable (KTD9 + U5). Default
  // `500` keeps each batch small enough that SQLite's single-writer
  // model doesn't lock the app for an extended window.
  tasksBackfillBatchSize: "tasks.backfill.batchSize",
  // Hard cap on email dispatch per enable event. When the eligible
  // backfill target count exceeds this and the admin chose `notify`,
  // the enable endpoint refuses with a 4xx + structured message so
  // the admin can either raise the cap temporarily or run silent then
  // notify selectively. Default `1000`. Silent backfill is unaffected.
  tasksBackfillMaxEmailsPerEnable: "tasks.backfill.maxEmailsPerEnable",
  // Global-tick scheduler claim window. The tick endpoint refuses a
  // run when the previous run's timestamp (`tasks.tick.lastRunAt`) is
  // within `tasks.tick.windowMs` ago — prevents two concurrent cron
  // pings doing the same sweep. Default 300_000 (5 min).
  tasksTickLastRunAt: "tasks.tick.lastRunAt",
  tasksTickWindowMs: "tasks.tick.windowMs",
  // Shared secret authenticating the tick endpoint. Generated on first
  // read (32 random bytes hex-encoded) if not present. Stored with
  // `isSecret: true` so it never leaks to the UI; rotate by editing
  // the row from `/super-admin/system-settings`.
  tasksTickSecret: "tasks.tick.secret",
  // Per-user lazy-eval window. `maybeProcessUserTriggers` claims this
  // window via `tasks.user.lastRunAt.<userId>` and skips when the
  // previous claim is within `tasks.scheduler.userWindowMs` ago.
  // Default 300_000 (5 min).
  tasksSchedulerUserWindowMs: "tasks.scheduler.userWindowMs",
} as const;

/** Prefix for the per-user lazy-eval claim row. The userId is appended. */
export const TASKS_USER_LAST_RUN_AT_PREFIX = "tasks.user.lastRunAt." as const;

export function tasksUserLastRunAtKey(userId: string): string {
  return `${TASKS_USER_LAST_RUN_AT_PREFIX}${userId}`;
}

/** Built-in defaults used when no override row exists in SystemSetting. */
export const DEFAULT_LOG_RETENTION_DAYS = {
  error: 90,
  warning: 30,
  info: 7,
} as const;

export const DEFAULT_TRANSLATE_PROVIDER = "anthropic" as const;
export const DEFAULT_TRANSLATE_MODELS = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
} as const;

const SECRET_KEYS = new Set<string>([
  SETTING_KEYS.smtpPass,
  SETTING_KEYS.translateAnthropicApiKey,
  SETTING_KEYS.translateOpenaiApiKey,
  SETTING_KEYS.translateDeeplApiKey,
  SETTING_KEYS.tasksTickSecret,
]);

const ENV_FALLBACK: Record<string, string | undefined> = {
  [SETTING_KEYS.smtpHost]: process.env.SMTP_HOST,
  [SETTING_KEYS.smtpPort]: process.env.SMTP_PORT,
  [SETTING_KEYS.smtpUser]: process.env.SMTP_USER,
  [SETTING_KEYS.smtpPass]: process.env.SMTP_PASS,
  [SETTING_KEYS.smtpFrom]: process.env.SMTP_FROM,
  [SETTING_KEYS.logRetentionErrorDays]: undefined,
  [SETTING_KEYS.logRetentionWarningDays]: undefined,
  [SETTING_KEYS.logRetentionInfoDays]: undefined,
  [SETTING_KEYS.logLastPrunedAt]: undefined,
  [SETTING_KEYS.translateProvider]: process.env.TRANSLATE_PROVIDER,
  [SETTING_KEYS.translateAnthropicApiKey]: process.env.ANTHROPIC_API_KEY,
  [SETTING_KEYS.translateAnthropicModel]: process.env.ANTHROPIC_MODEL,
  [SETTING_KEYS.translateOpenaiApiKey]: process.env.OPENAI_API_KEY,
  [SETTING_KEYS.translateOpenaiModel]: process.env.OPENAI_MODEL,
  [SETTING_KEYS.translateDeeplApiKey]: process.env.DEEPL_API_KEY,
  [SETTING_KEYS.tasksSchedulerEnabled]: undefined,
  [SETTING_KEYS.tasksBackfillBatchSize]: undefined,
  [SETTING_KEYS.tasksBackfillMaxEmailsPerEnable]: undefined,
  [SETTING_KEYS.tasksTickLastRunAt]: undefined,
  [SETTING_KEYS.tasksTickWindowMs]: undefined,
  [SETTING_KEYS.tasksTickSecret]: undefined,
  [SETTING_KEYS.tasksSchedulerUserWindowMs]: undefined,
};

/** Built-in defaults for the tasks-backfill knobs, per KTD8 / U5. */
export const DEFAULT_TASKS_BACKFILL_BATCH_SIZE = 500 as const;
export const DEFAULT_TASKS_BACKFILL_MAX_EMAILS_PER_ENABLE = 1000 as const;
/** Built-in defaults for the scheduler claim windows, per KTD8 / U6. */
export const DEFAULT_TASKS_TICK_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_TASKS_USER_WINDOW_MS = 5 * 60 * 1000;

/** Resolve a setting: DB value if a row exists (even if blank), else env. */
export async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (row) return row.value ?? undefined;
  return ENV_FALLBACK[key];
}

export async function getSettings(keys: readonly string[]): Promise<Record<string, string | undefined>> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...keys] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value ?? undefined]));
  const out: Record<string, string | undefined> = {};
  for (const k of keys) {
    out[k] = byKey.has(k) ? byKey.get(k) : ENV_FALLBACK[k];
  }
  return out;
}

export async function setSetting(key: string, value: string | null) {
  const isSecret = SECRET_KEYS.has(key);
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, isSecret },
    update: { value },
  });
}

export type SmtpSettings = {
  host: string | undefined;
  port: number | undefined;
  user: string | undefined;
  /** True when a password is configured (env or DB); the value itself is never returned. */
  hasPassword: boolean;
  from: string | undefined;
};

/** Read SMTP settings shaped for the UI. The password is reduced to a presence flag. */
export async function getSmtpSettings(): Promise<SmtpSettings> {
  const s = await getSettings([
    SETTING_KEYS.smtpHost,
    SETTING_KEYS.smtpPort,
    SETTING_KEYS.smtpUser,
    SETTING_KEYS.smtpPass,
    SETTING_KEYS.smtpFrom,
  ]);
  const portNum = s[SETTING_KEYS.smtpPort] ? Number(s[SETTING_KEYS.smtpPort]) : undefined;
  return {
    host: s[SETTING_KEYS.smtpHost],
    port: Number.isFinite(portNum) ? portNum : undefined,
    user: s[SETTING_KEYS.smtpUser],
    hasPassword: !!s[SETTING_KEYS.smtpPass],
    from: s[SETTING_KEYS.smtpFrom],
  };
}

export type LogRetention = {
  /** Whole days; 0 means "never prune this level". */
  error: number;
  warning: number;
  info: number;
};

/** Read configured retention windows; falls back to DEFAULT_LOG_RETENTION_DAYS. */
export async function getLogRetention(): Promise<LogRetention> {
  const s = await getSettings([
    SETTING_KEYS.logRetentionErrorDays,
    SETTING_KEYS.logRetentionWarningDays,
    SETTING_KEYS.logRetentionInfoDays,
  ]);
  const parse = (v: string | undefined, fallback: number) => {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  return {
    error: parse(s[SETTING_KEYS.logRetentionErrorDays], DEFAULT_LOG_RETENTION_DAYS.error),
    warning: parse(s[SETTING_KEYS.logRetentionWarningDays], DEFAULT_LOG_RETENTION_DAYS.warning),
    info: parse(s[SETTING_KEYS.logRetentionInfoDays], DEFAULT_LOG_RETENTION_DAYS.info),
  };
}

export type TranslateProvider = "anthropic" | "openai" | "deepl";

export type TranslateSettings = {
  provider: TranslateProvider;
  anthropic: { hasApiKey: boolean; model: string };
  openai: { hasApiKey: boolean; model: string };
  deepl: { hasApiKey: boolean };
};

/** Coerce a free-form provider string from the DB/env to a known value. */
function coerceProvider(raw: string | undefined | null): TranslateProvider {
  const v = (raw ?? DEFAULT_TRANSLATE_PROVIDER).toLowerCase();
  if (v === "openai") return "openai";
  if (v === "deepl") return "deepl";
  return "anthropic";
}

/** UI-safe view of the translate-provider configuration. Secrets reduced to presence flags. */
export async function getTranslateSettings(): Promise<TranslateSettings> {
  const s = await getSettings([
    SETTING_KEYS.translateProvider,
    SETTING_KEYS.translateAnthropicApiKey,
    SETTING_KEYS.translateAnthropicModel,
    SETTING_KEYS.translateOpenaiApiKey,
    SETTING_KEYS.translateOpenaiModel,
    SETTING_KEYS.translateDeeplApiKey,
  ]);
  return {
    provider: coerceProvider(s[SETTING_KEYS.translateProvider]),
    anthropic: {
      hasApiKey: !!s[SETTING_KEYS.translateAnthropicApiKey],
      model:
        s[SETTING_KEYS.translateAnthropicModel]?.trim() || DEFAULT_TRANSLATE_MODELS.anthropic,
    },
    openai: {
      hasApiKey: !!s[SETTING_KEYS.translateOpenaiApiKey],
      model:
        s[SETTING_KEYS.translateOpenaiModel]?.trim() || DEFAULT_TRANSLATE_MODELS.openai,
    },
    deepl: {
      hasApiKey: !!s[SETTING_KEYS.translateDeeplApiKey],
    },
  };
}

/**
 * Read the resolved provider config including the API key — server-only,
 * for the actual translate call. Returns null when no key is available
 * for the configured provider so callers can surface a friendly error
 * rather than letting the SDK throw.
 *
 * The shape is a discriminated union on `provider` so callers can
 * narrow before reading provider-specific fields (LLMs have a model,
 * DeepL doesn't).
 */
export type TranslateSendConfig =
  | { provider: "anthropic"; apiKey: string; model: string }
  | { provider: "openai"; apiKey: string; model: string }
  | { provider: "deepl"; apiKey: string };

export async function getTranslateConfigForSend(): Promise<TranslateSendConfig | null> {
  const s = await getSettings([
    SETTING_KEYS.translateProvider,
    SETTING_KEYS.translateAnthropicApiKey,
    SETTING_KEYS.translateAnthropicModel,
    SETTING_KEYS.translateOpenaiApiKey,
    SETTING_KEYS.translateOpenaiModel,
    SETTING_KEYS.translateDeeplApiKey,
  ]);
  const provider = coerceProvider(s[SETTING_KEYS.translateProvider]);

  if (provider === "anthropic") {
    const apiKey = s[SETTING_KEYS.translateAnthropicApiKey]?.trim();
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model:
        s[SETTING_KEYS.translateAnthropicModel]?.trim() || DEFAULT_TRANSLATE_MODELS.anthropic,
    };
  }
  if (provider === "openai") {
    const apiKey = s[SETTING_KEYS.translateOpenaiApiKey]?.trim();
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: s[SETTING_KEYS.translateOpenaiModel]?.trim() || DEFAULT_TRANSLATE_MODELS.openai,
    };
  }
  // deepl
  const apiKey = s[SETTING_KEYS.translateDeeplApiKey]?.trim();
  if (!apiKey) return null;
  return { provider, apiKey };
}

/**
 * Tasks-subsystem runtime kill switch (KTD8). Threaded as the FIRST
 * short-circuit in every dispatch entry point (signup hook,
 * manual-assign, backfill, recurring scheduler, dated scheduler, tick
 * endpoint, notification dispatch). When `false`, those paths return
 * silently without creating instances or firing notifications/emails.
 *
 * Default `true` — interpreted from the absence of a row, an empty
 * value, or anything other than the literal string `"false"`. The
 * setting is read at point of use (never cached at module load) so
 * an admin flip from /super-admin/system-settings takes effect on the
 * next call without a redeploy.
 */
export async function isTasksSchedulerEnabled(): Promise<boolean> {
  const raw = await getSetting(SETTING_KEYS.tasksSchedulerEnabled);
  if (raw === undefined || raw === null) return true;
  const v = raw.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return true;
}

/**
 * Parse a positive-integer setting value. Returns `fallback` when the row
 * is absent, blank, non-numeric, or non-positive — admins should never
 * accidentally trip a batch size of 0 (would infinite-loop) or negative
 * caps. Resolved at point of use, never cached at module load.
 */
function parsePositiveIntSetting(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Batch size for `runBackfillForDefinition` (KTD9 / U5). Default 500
 * keeps SQLite's single-writer model from being locked for too long on
 * a large user base. Read at point of use so an admin flip from
 * /super-admin/system-settings takes effect on the next call.
 */
export async function getBackfillBatchSize(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.tasksBackfillBatchSize);
  return parsePositiveIntSetting(raw, DEFAULT_TASKS_BACKFILL_BATCH_SIZE);
}

/**
 * Maximum number of emails dispatched per backfill-on-enable when the
 * admin chose `notify` (KTD8 / U5). The enable endpoint pre-checks the
 * eligible target count against this cap and refuses with a 4xx +
 * structured message when it would be exceeded — silent backfill is
 * not affected. Default 1000.
 */
export async function getMaxEmailsPerEnable(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.tasksBackfillMaxEmailsPerEnable);
  return parsePositiveIntSetting(
    raw,
    DEFAULT_TASKS_BACKFILL_MAX_EMAILS_PER_ENABLE,
  );
}

/**
 * Read (or lazily generate) the shared secret authenticating the tick
 * endpoint (KTD1 / U6). When no row exists, generate 32 random bytes
 * hex-encoded, persist via `setSetting` (marked `isSecret: true` via
 * SECRET_KEYS), log a warning so ops knows to capture it for cron
 * config, and return the freshly-generated value. The return is
 * always a non-empty string — callers can `timingSafeEqual` against
 * it directly without a null check.
 */
export async function getOrCreateTickSecret(): Promise<string> {
  const existing = await getSetting(SETTING_KEYS.tasksTickSecret);
  if (existing && existing.trim().length > 0) return existing;
  const secret = randomBytes(32).toString("hex");
  await setSetting(SETTING_KEYS.tasksTickSecret, secret);
  // Warning, not error — first-boot generation is expected. Surfaces
  // in the dev console so ops captures the secret for the external
  // cron config.
  console.warn(
    "[tasks.tick] generated new shared secret on first read — capture it from /super-admin/system-settings for cron config:",
    secret,
  );
  return secret;
}

/**
 * Window (ms) for the global tick claim (KTD8 / U6). The tick endpoint
 * skips a run when the previous run's `tasks.tick.lastRunAt` is within
 * this many ms ago. Default 300_000 (5 min).
 */
export async function getTickWindowMs(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.tasksTickWindowMs);
  return parsePositiveIntSetting(raw, DEFAULT_TASKS_TICK_WINDOW_MS);
}

/**
 * Window (ms) for the per-user lazy-eval claim (KTD8 / U6).
 * `maybeProcessUserTriggers` skips when the previous claim is within
 * this many ms ago. Default 300_000 (5 min).
 */
export async function getSchedulerUserWindowMs(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.tasksSchedulerUserWindowMs);
  return parsePositiveIntSetting(raw, DEFAULT_TASKS_USER_WINDOW_MS);
}

/**
 * Read SMTP settings including the password — server-only, for actual sending.
 */
export async function getSmtpConfigForSend(): Promise<{
  host: string | undefined;
  port: number | undefined;
  user: string | undefined;
  pass: string | undefined;
  from: string | undefined;
}> {
  const s = await getSettings([
    SETTING_KEYS.smtpHost,
    SETTING_KEYS.smtpPort,
    SETTING_KEYS.smtpUser,
    SETTING_KEYS.smtpPass,
    SETTING_KEYS.smtpFrom,
  ]);
  const portNum = s[SETTING_KEYS.smtpPort] ? Number(s[SETTING_KEYS.smtpPort]) : undefined;
  return {
    host: s[SETTING_KEYS.smtpHost],
    port: Number.isFinite(portNum) ? portNum : undefined,
    user: s[SETTING_KEYS.smtpUser],
    pass: s[SETTING_KEYS.smtpPass],
    from: s[SETTING_KEYS.smtpFrom],
  };
}
