import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { VERIFY_EMAIL_TTL_MS, sendEmailVerificationEmail } from "@/lib/email";
import { logError } from "@/lib/log.server";
import { hashPassword } from "@/lib/password";
import { createInstancesForSignup } from "@/lib/tasks";
import { generateToken } from "@/lib/tokens";
import { signupSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { email, name, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
    select: { id: true, email: true, name: true },
  });

  const { token, tokenHash } = generateToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      purpose: "signup",
      expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
    },
  });

  const base = process.env.APP_URL ?? "http://localhost:3010";
  const verifyUrl = `${base}/verify-email/${token}`;
  try {
    await sendEmailVerificationEmail(user.email, verifyUrl, {
      name: user.name,
      userId: user.id,
    });
  } catch (err) {
    await logError(err, {
      context: { feature: "signup.send-verification", userId: user.id },
      userId: user.id,
    });
  }

  // Fan out signup-triggered task instances (R7 / U4). Fire-and-forget so
  // signup latency does not depend on the catalog size or the predicate
  // evaluation. `createInstancesForSignup` is internally swallow-and-log;
  // a failure here cannot fail the signup.
  void createInstancesForSignup(user.id);

  return NextResponse.json({ ok: true, requiresVerification: true }, { status: 201 });
}
