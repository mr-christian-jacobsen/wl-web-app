import nodemailer, { type Transporter } from "nodemailer";

import { prisma } from "@/lib/db";
import { escapeHtml, renderTemplateByKey, type TemplateVars } from "@/lib/templates";

const FROM = process.env.SMTP_FROM ?? "no-reply@wl-web-app.local";
const HOST = process.env.SMTP_HOST;

let transporter: Transporter | null = null;
if (HOST) {
  transporter = nodemailer.createTransport({
    host: HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
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
    .catch((err) => {
      console.error("[email] Failed to create audit row", err);
      return null;
    });

  let status: "sent" | "failed" | "skipped";
  let errorMessage: string | null = null;

  if (!transporter) {
    status = "skipped";
    console.log(
      `[email:console] SMTP not configured. Would send to=${opts.to} subject="${opts.subject}"\n${opts.text}`,
    );
  } else {
    try {
      await transporter.sendMail({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      });
      status = "sent";
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[email] SMTP send failed; logging instead:`, err);
      console.log(`[email:fallback] to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
    }
  }

  if (log) {
    await prisma.email
      .update({ where: { id: log.id }, data: { status, error: errorMessage } })
      .catch((err) => {
        console.error("[email] Failed to update audit row", err);
      });
  }
}

class TemplateNotFoundError extends Error {
  constructor(key: string) {
    super(`Email template not found: ${key}`);
    this.name = "TemplateNotFoundError";
  }
}

async function sendTemplatedEmail(
  type: EmailType,
  to: string,
  vars: TemplateVars,
  ctx: { userId?: string | null },
) {
  const rendered = await renderTemplateByKey(type, vars);
  if (!rendered) throw new TemplateNotFoundError(type);
  await send({
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    type,
    templateKey: type,
    userId: ctx.userId,
  });
}

/** Render via the named template; if it doesn't exist, send the fallback. */
async function sendWithTemplateOrFallback(
  type: EmailType,
  to: string,
  vars: TemplateVars,
  fallback: { subject: string; text: string; html?: string },
  ctx: { userId?: string | null },
) {
  try {
    await sendTemplatedEmail(type, to, vars, ctx);
  } catch (err) {
    if (!(err instanceof TemplateNotFoundError)) throw err;
    await send({
      to,
      ...fallback,
      type,
      templateKey: null,
      userId: ctx.userId,
    });
  }
}

export async function sendUserInvitationEmail(
  to: string,
  opts: { name: string; password: string; userId?: string | null },
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
    {
      subject: "Your wl-web-app account is ready",
      text: `Hi ${opts.name},\n\nAn account has been created for you on wl-web-app.\n\nSign in at: ${loginUrl}\nEmail: ${to}\nTemporary password: ${opts.password}\n\nFor security, change your password after signing in.`,
      html: `
      <p>Hi ${escapeHtml(opts.name)},</p>
      <p>An account has been created for you on wl-web-app.</p>
      <p>Sign in at <a href="${loginUrl}">${loginUrl}</a></p>
      <ul>
        <li>Email: <code>${escapeHtml(to)}</code></li>
        <li>Temporary password: <code>${escapeHtml(opts.password)}</code></li>
      </ul>
      <p>For security, change your password after signing in.</p>
    `,
    },
    { userId: opts.userId },
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
  opts: { name?: string; userId?: string | null } = {},
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "email_verification",
    to,
    {
      name: opts.name ?? "",
      email: to,
      verifyUrl,
      appUrl,
      ttlMinutes: VERIFICATION_TTL_MINUTES,
    },
    {
      subject: "Confirm your email address",
      text: `Welcome${opts.name ? `, ${opts.name}` : ""}!\n\nConfirm your email by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
      html: `
      <p>Welcome${opts.name ? `, ${escapeHtml(opts.name)}` : ""}!</p>
      <p>Confirm your email by clicking <a href="${verifyUrl}">${verifyUrl}</a>.</p>
      <p>This link expires in 24 hours. If you did not create an account, ignore this email.</p>
    `,
    },
    { userId: opts.userId },
  );
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  opts: { name?: string; userId?: string | null } = {},
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "password_reset",
    to,
    {
      name: opts.name ?? "",
      email: to,
      resetUrl,
      appUrl,
      ttlMinutes: RESET_TTL_MINUTES,
    },
    {
      subject: "Reset your password",
      text: `Reset your password by visiting: ${resetUrl}\n\nThis link expires in ${RESET_TTL_MINUTES} minutes. If you did not request this, ignore this email.`,
      html: `
      <p>Reset your password by clicking the link below:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in ${RESET_TTL_MINUTES} minutes. If you did not request this, ignore this email.</p>
    `,
    },
    { userId: opts.userId },
  );
}

export async function sendEmailChangeConfirmation(
  to: string,
  confirmUrl: string,
  opts: { name?: string; oldEmail: string; userId?: string | null },
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "email_change_confirmation",
    to,
    {
      name: opts.name ?? "",
      oldEmail: opts.oldEmail,
      newEmail: to,
      confirmUrl,
      appUrl,
      ttlMinutes: EMAIL_CHANGE_TTL_MINUTES,
    },
    {
      subject: "Confirm your new email address",
      text: `Hi${opts.name ? ` ${opts.name}` : ""},\n\nYou (or someone using your account) asked to change the email on file from ${opts.oldEmail} to this address.\n\nConfirm the change by visiting:\n${confirmUrl}\n\nThis link expires in 24 hours. If you didn't request this, ignore this email — your account stays on ${opts.oldEmail}.`,
      html: `
      <p>Hi${opts.name ? ` ${escapeHtml(opts.name)}` : ""},</p>
      <p>You (or someone using your account) asked to change the email on file from <code>${escapeHtml(opts.oldEmail)}</code> to this address.</p>
      <p>Confirm the change by clicking <a href="${confirmUrl}">${confirmUrl}</a>.</p>
      <p>This link expires in 24 hours. If you didn't request this, ignore this email — your account stays on <code>${escapeHtml(opts.oldEmail)}</code>.</p>
    `,
    },
    { userId: opts.userId },
  );
}
