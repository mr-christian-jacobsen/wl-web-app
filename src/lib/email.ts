import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";
import { logError, logWarning } from "@/lib/log.server";
import { getSmtpConfigForSend } from "@/lib/system-settings";
import { renderFallback, type TemplateVars } from "@/lib/templates";
import { renderTemplateByKey } from "@/lib/templates.server";

const DEFAULT_FROM = "no-reply@wl-web-app.local";

/**
 * Build a one-shot transporter from the current SMTP settings (DB > env).
 * Rebuilt per send so admin edits via /super-admin/system-settings take effect
 * without a process restart. Cheap: one indexed primary-key lookup per send.
 */
async function buildTransporter(): Promise<{
  transporter: ReturnType<typeof nodemailer.createTransport> | null;
  from: string;
}> {
  const cfg = await getSmtpConfigForSend();
  const from = cfg.from ?? DEFAULT_FROM;
  if (!cfg.host) {
    return { transporter: null, from };
  }
  const port = cfg.port ?? 1025;
  return {
    from,
    transporter: nodemailer.createTransport({
      host: cfg.host,
      port,
      // Implicit TLS on port 465 (SMTPS), STARTTLS on 587/25/1025.
      secure: port === 465,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    }),
  };
}

export type EmailType =
  | "user_invitation"
  | "email_verification"
  | "password_reset"
  | "email_change_confirmation";

type SendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  /** What kind of email this is (used for the audit log + filtering). */
  type: EmailType;
  /** Set when an admin-defined template was used; null when the hardcoded fallback rendered. */
  templateKey: EmailType | null;
  /** Recipient's User row, if known. Kept on the audit row even after the user is deleted. */
  userId?: string | null;
};

type DeliveryOutcome = {
  status: "sent" | "failed" | "skipped";
  error: string | null;
};

/**
 * Try to deliver one piece of mail via the configured SMTP transporter and
 * report the outcome. Falls back to console-logging when no transporter is
 * configured (status = "skipped"). Never throws — the caller decides how to
 * persist the outcome.
 */
async function attemptSmtpDelivery(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}): Promise<DeliveryOutcome> {
  const { transporter, from } = await buildTransporter();
  if (!transporter) {
    console.log(
      `[email:console] SMTP not configured. Would send to=${opts.to} subject="${opts.subject}"\n${opts.text}`,
    );
    return { status: "skipped", error: null };
  }
  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
    });
    return { status: "sent", error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logError(err, {
      context: { feature: "smtp.send", to: opts.to, subject: opts.subject },
    });
    console.log(`[email:fallback] to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
    return { status: "failed", error: message };
  }
}

/**
 * One-off send used by the system-settings "Send test email" button. Bypasses
 * audit logging and template rendering; uses whatever transporter the current
 * settings produce, returning the raw delivery outcome.
 */
export async function sendTestEmail(to: string): Promise<DeliveryOutcome> {
  return attemptSmtpDelivery({
    to,
    subject: "Test email from wl-web-app",
    text: "This is a test email sent from /super-admin/system-settings to verify your SMTP configuration is working.",
    html: "<p>This is a test email sent from <code>/super-admin/system-settings</code> to verify your SMTP configuration is working.</p>",
  });
}

/**
 * Send an email and audit-log every attempt. Inserts a `pending` row first so
 * a process crash mid-send still leaves a record; updates the row to `sent` /
 * `failed` / `skipped` once the SMTP call resolves.
 */
async function send(opts: SendInput) {
  const log = await prisma.email
    .create({
      data: {
        to: opts.to,
        type: opts.type,
        templateKey: opts.templateKey,
        subject: opts.subject,
        bodyText: opts.text,
        bodyHtml: opts.html ?? null,
        status: "pending",
        userId: opts.userId ?? null,
      },
      select: { id: true },
    })
    .catch(async (err) => {
      await logWarning("Email audit row create failed", {
        cause: err,
        context: { feature: "email.audit.create", to: opts.to, type: opts.type },
      });
      return null;
    });

  const outcome = await attemptSmtpDelivery({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? null,
  });

  if (log) {
    await prisma.email
      .update({
        where: { id: log.id },
        data: { status: outcome.status, error: outcome.error },
      })
      .catch(async (err) => {
        await logWarning("Email audit row update failed", {
          cause: err,
          context: { feature: "email.audit.update", auditId: log.id },
        });
      });
  }
}

export class EmailNotFoundError extends Error {
  constructor(id: string) {
    super(`Email audit row not found: ${id}`);
    this.name = "EmailNotFoundError";
  }
}

/**
 * Re-attempt delivery of a previously-recorded email using its captured
 * subject/body. Updates the existing audit row's status, error and sentAt to
 * reflect this latest attempt — does NOT create a new row.
 */
export async function resendEmail(id: string) {
  const existing = await prisma.email.findUnique({ where: { id } });
  if (!existing) throw new EmailNotFoundError(id);

  const outcome = await attemptSmtpDelivery({
    to: existing.to,
    subject: existing.subject,
    text: existing.bodyText,
    html: existing.bodyHtml,
  });

  return prisma.email.update({
    where: { id },
    data: {
      status: outcome.status,
      error: outcome.error,
      sentAt: new Date(),
    },
  });
}

/**
 * Resolve the language id to use for a send. Precedence:
 *   1. `ctx.languageId` if the caller passed one explicitly.
 *   2. `User.languageId` if `ctx.userId` points at an existing row.
 *   3. `undefined` — the resolver then falls back to the system default.
 */
async function resolveLanguageId(ctx: {
  userId?: string | null;
  languageId?: string | null;
}): Promise<string | undefined> {
  if (ctx.languageId) return ctx.languageId;
  if (!ctx.userId) return undefined;
  const u = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { languageId: true },
  });
  return u?.languageId ?? undefined;
}

/**
 * Render via the named admin-defined template; if none exists, render the
 * registry fallback. Both paths produce the same shape, so callers don't pass
 * fallback copy — it lives in `KNOWN_TEMPLATES`.
 */
async function sendWithTemplateOrFallback(
  type: EmailType,
  to: string,
  vars: TemplateVars,
  ctx: { userId?: string | null; languageId?: string | null },
) {
  const languageId = await resolveLanguageId(ctx);
  const fromDb = await renderTemplateByKey(type, vars, languageId);
  if (fromDb) {
    await send({
      to,
      subject: fromDb.subject,
      text: fromDb.text,
      html: fromDb.html,
      type,
      templateKey: type,
      userId: ctx.userId,
    });
    return;
  }

  const fallback = renderFallback(type, vars);
  if (!fallback) {
    throw new Error(`Email template not found in registry: ${type}`);
  }
  await send({
    to,
    subject: fallback.subject,
    text: fallback.text,
    html: fallback.html,
    type,
    templateKey: null,
    userId: ctx.userId,
  });
}

export async function sendUserInvitationEmail(
  to: string,
  opts: {
    name: string;
    password: string;
    userId?: string | null;
    languageId?: string | null;
  },
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const loginUrl = `${appUrl}/login`;
  await sendWithTemplateOrFallback(
    "user_invitation",
    to,
    {
      name: opts.name,
      email: to,
      password: opts.password,
      appUrl,
      loginUrl,
    },
    { userId: opts.userId, languageId: opts.languageId },
  );
}

const RESET_TTL_MINUTES = 30;
const VERIFICATION_TTL_MINUTES = 60 * 24; // 24 hours
const EMAIL_CHANGE_TTL_MINUTES = 60 * 24;

export const VERIFY_EMAIL_TTL_MS = VERIFICATION_TTL_MINUTES * 60_000;
export const EMAIL_CHANGE_TTL_MS = EMAIL_CHANGE_TTL_MINUTES * 60_000;

export async function sendEmailVerificationEmail(
  to: string,
  verifyUrl: string,
  opts: { name?: string; userId?: string | null; languageId?: string | null } = {},
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "email_verification",
    to,
    {
      name: opts.name && opts.name.length > 0 ? opts.name : "there",
      email: to,
      verifyUrl,
      appUrl,
      ttlMinutes: VERIFICATION_TTL_MINUTES,
    },
    { userId: opts.userId, languageId: opts.languageId },
  );
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  opts: { name?: string; userId?: string | null; languageId?: string | null } = {},
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "password_reset",
    to,
    {
      name: opts.name && opts.name.length > 0 ? opts.name : "there",
      email: to,
      resetUrl,
      appUrl,
      ttlMinutes: RESET_TTL_MINUTES,
    },
    { userId: opts.userId, languageId: opts.languageId },
  );
}

export async function sendEmailChangeConfirmation(
  to: string,
  confirmUrl: string,
  opts: {
    name?: string;
    oldEmail: string;
    userId?: string | null;
    languageId?: string | null;
  },
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "email_change_confirmation",
    to,
    {
      name: opts.name && opts.name.length > 0 ? opts.name : "there",
      oldEmail: opts.oldEmail,
      newEmail: to,
      confirmUrl,
      appUrl,
      ttlMinutes: EMAIL_CHANGE_TTL_MINUTES,
    },
    { userId: opts.userId, languageId: opts.languageId },
  );
}
