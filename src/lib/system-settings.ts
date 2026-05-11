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
} as const;

/** Built-in defaults used when no override row exists in SystemSetting. */
export const DEFAULT_LOG_RETENTION_DAYS = {
  error: 90,
  warning: 30,
  info: 7,
} as const;

const SECRET_KEYS = new Set<string>([SETTING_KEYS.smtpPass]);

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
};

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

/** Read SMTP settings including the password — server-only, for actual sending. */
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
