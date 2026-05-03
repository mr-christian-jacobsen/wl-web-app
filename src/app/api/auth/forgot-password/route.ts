import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { generateToken } from "@/lib/tokens";
import { forgotPasswordSchema } from "@/lib/validators";

const TOKEN_TTL_MINUTES = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const resetUrl = `${base}/reset-password/${token}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl, {
        name: user.name,
        userId: user.id,
      });
    } catch (err) {
      console.error("Failed to send reset email", err);
    }
  }

  return NextResponse.json({ ok: true });
}
