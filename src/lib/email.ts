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

const RESET_TTL_MINUTES = 30;

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
  opts: { name?: string } = {},
) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendWithTemplateOrFallback(
    "email_change_confirmation",
    to,
    {
      name: opts.name ?? "",
      email: to,
      confirmUrl,
      appUrl,
    },
    {
      subject: "Confirm your new email address",
      text: `Confirm your new email by visiting: ${confirmUrl}`,
      html: `<p>Confirm your new email by clicking <a href="${confirmUrl}">${confirmUrl}</a>.</p>`,
    },
  );
}
