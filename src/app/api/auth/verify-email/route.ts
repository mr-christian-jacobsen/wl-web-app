import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { verifyEmailSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Verification link is invalid or expired" },
      { status: 400 },
    );
  }

  if (record.purpose === "signup") {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true, purpose: "signup" });
  }

  if (record.purpose === "change") {
    if (!record.newEmail) {
      return NextResponse.json({ error: "Verification link is malformed" }, { status: 400 });
    }
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: record.userId },
          data: { email: record.newEmail, emailVerifiedAt: new Date() },
        }),
        prisma.emailVerificationToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
      ]);
      return NextResponse.json({ ok: true, purpose: "change" });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          { error: "That email address is already in use." },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  return NextResponse.json({ error: "Unknown verification purpose" }, { status: 400 });
}
