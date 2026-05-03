import nodemailer, { type Transporter } from "nodemailer";

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

async function send(opts: { to: string; subject: string; text: string; html: string }) {
  if (!transporter) {
    console.log(
      `[email:console] SMTP not configured. Would send to=${opts.to} subject="${opts.subject}"\n${opts.text}`,
    );
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, ...opts });
  } catch (err) {
    console.error(`[email] SMTP send failed; logging instead:`, err);
    console.log(`[email:fallback] to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await send({
    to,
    subject: "Reset your password",
    text: `Reset your password by visiting: ${resetUrl}\n\nThis link expires in 30 minutes. If you did not request this, ignore this email.`,
    html: `
      <p>Reset your password by clicking the link below:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>
    `,
  });
}

export async function sendEmailChangeConfirmation(to: string, confirmUrl: string) {
  await send({
    to,
    subject: "Confirm your new email address",
    text: `Confirm your new email by visiting: ${confirmUrl}`,
    html: `<p>Confirm your new email by clicking <a href="${confirmUrl}">${confirmUrl}</a>.</p>`,
  });
}
