import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { VERIFY_EMAIL_TTL_MS, sendEmailVerificationEmail } from "@/lib/email";
import { generateToken } from "@/lib/tokens";
import { resendVerificationSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = resendVerificationSchema.safeParse(body);
  if (!parsed.success) {
    // Always return ok to avoid account-existence enumeration.
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && !user.emailVerifiedAt) {
    const { token, tokenHash } = generateToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: "signup",
        expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
      },
    });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const verifyUrl = `${base}/verify-email/${token}`;
    try {
      await sendEmailVerificationEmail(user.email, verifyUrl, { name: user.name });
    } catch (err) {
      console.error("[resend-verification] Failed to send", err);
    }
  }

  return NextResponse.json({ ok: true });
}
