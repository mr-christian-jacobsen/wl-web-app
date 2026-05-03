import nodemailer, { type Transporter } from "nodemailer";

import { renderTemplateByKey, type TemplateVars } from "@/lib/templates";

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

async function send(opts: { to: string; subject: string; text: string; html?: string | null }) {
  const message = {
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  };
  if (!transporter) {
    console.log(
      `[email:console] SMTP not configured. Would send to=${opts.to} subject="${opts.subject}"\n${opts.text}`,
    );
    return;
  }
  try {
    await transporter.sendMail(message);
  } catch (err) {
    console.error(`[email] SMTP send failed; logging instead:`, err);
    console.log(`[email:fallback] to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
  }
}

export class TemplateNotFoundError extends Error {
  constructor(key: string) {
    super(`Email template not found: ${key}`);
    this.name = "TemplateNotFoundError";
  }
}

export async function sendTemplatedEmail(key: string, to: string, vars: TemplateVars) {
  const rendered = await renderTemplateByKey(key, vars);
  if (!rendered) throw new TemplateNotFoundError(key);
  await send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html });
}

/** Render via the named template; if it doesn't exist, send the fallback. */
async function sendWithTemplateOrFallback(
  key: string,
  to: string,
  vars: TemplateVars,
  fallback: { subject: string; text: string; html?: string },
) {
  try {
    await sendTemplatedEmail(key, to, vars);
  } catch (err) {
    if (!(err instanceof TemplateNotFoundError)) throw err;
    await send({ to, ...fallback });
  }
}

export async function sendUserInvitationEmail(
  to: string,
  opts: { name: string; password: string },
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
      <p>Hi ${opts.name},</p>
      <p>An account has been created for you on wl-web-app.</p>
      <p>Sign in at <a href="${loginUrl}">${loginUrl}</a></p>
      <ul>
        <li>Email: <code>${to}</code></li>
        <li>Temporary password: <code>${opts.password}</code></li>
      </ul>
      <p>For security, change your password after signing in.</p>
    `,
    },
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
  opts: { name?: string } = {},
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
      <p>Welcome${opts.name ? `, ${opts.name}` : ""}!</p>
      <p>Confirm your email by clicking <a href="${verifyUrl}">${verifyUrl}</a>.</p>
      <p>This link expires in 24 hours. If you did not create an account, ignore this email.</p>
    `,
    },
  );
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  opts: { name?: string } = {},
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
  );
}

export async function sendEmailChangeConfirmation(
  to: string,
  confirmUrl: string,
  opts: { name?: string; oldEmail: string },
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
      <p>Hi${opts.name ? ` ${opts.name}` : ""},</p>
      <p>You (or someone using your account) asked to change the email on file from <code>${opts.oldEmail}</code> to this address.</p>
      <p>Confirm the change by clicking <a href="${confirmUrl}">${confirmUrl}</a>.</p>
      <p>This link expires in 24 hours. If you didn't request this, ignore this email — your account stays on <code>${opts.oldEmail}</code>.</p>
    `,
    },
  );
}
