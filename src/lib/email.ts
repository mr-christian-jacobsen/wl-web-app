import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
    : undefined,
});

const FROM = process.env.SMTP_FROM ?? "no-reply@wl-web-app.local";

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await transporter.sendMail({
    from: FROM,
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
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Confirm your new email address",
    text: `Confirm your new email by visiting: ${confirmUrl}`,
    html: `<p>Confirm your new email by clicking <a href="${confirmUrl}">${confirmUrl}</a>.</p>`,
  });
}
