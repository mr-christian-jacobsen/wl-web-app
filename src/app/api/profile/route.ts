import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EMAIL_CHANGE_TTL_MS, sendEmailChangeConfirmation } from "@/lib/email";
import { generateToken } from "@/lib/tokens";
import { updateProfileSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wantsEmailChange =
    parsed.data.email !== undefined && parsed.data.email !== me.email;

  // Apply non-email changes immediately (just `name` for now).
  let updatedName: string | undefined;
  if (parsed.data.name !== undefined && parsed.data.name !== me.name) {
    const updated = await prisma.user.update({
      where: { id: me.id },
      data: { name: parsed.data.name },
      select: { name: true },
    });
    updatedName = updated.name;
  }

  // Email change requires confirmation via the new address.
  let pendingEmail: string | undefined;
  if (wantsEmailChange) {
    const newEmail = parsed.data.email!;

    const conflict = await prisma.user.findUnique({ where: { email: newEmail } });
    if (conflict) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    // Replace any prior unconsumed change-token for this user; one outstanding
    // request at a time is enough for this UI.
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: me.id, purpose: "change", usedAt: null },
    });

    const { token, tokenHash } = generateToken();
    try {
      await prisma.emailVerificationToken.create({
        data: {
          userId: me.id,
          tokenHash,
          purpose: "change",
          newEmail,
          expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        return NextResponse.json({ error: "Could not create token" }, { status: 500 });
      }
      throw err;
    }

    const base = process.env.APP_URL ?? "http://localhost:3000";
    const confirmUrl = `${base}/verify-email/${token}`;
    try {
      await sendEmailChangeConfirmation(newEmail, confirmUrl, {
        name: updatedName ?? me.name,
        oldEmail: me.email,
      });
    } catch (err) {
      console.error("[profile] Failed to send email-change confirmation", err);
    }

    pendingEmail = newEmail;
  }

  return NextResponse.json({
    user: {
      id: me.id,
      email: me.email, // unchanged until they confirm
      name: updatedName ?? me.name,
    },
    pendingEmailChange: pendingEmail
      ? { newEmail: pendingEmail, message: `We sent a confirmation link to ${pendingEmail}.` }
      : null,
  });
}
