import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EMAIL_CHANGE_TTL_MS, sendEmailChangeConfirmation } from "@/lib/email";
import { logError } from "@/lib/log.server";
import { reevaluatePendingInstancesForUser } from "@/lib/predicates";
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
    select: { id: true, email: true, name: true, languageId: true },
  });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wantsEmailChange =
    parsed.data.email !== undefined && parsed.data.email !== me.email;

  // If a non-null languageId was supplied, make sure it's a real row before
  // saving — keeps invalid foreign keys out of the table.
  if (typeof parsed.data.languageId === "string") {
    const exists = await prisma.language.findUnique({
      where: { id: parsed.data.languageId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Unknown language" }, { status: 400 });
    }
  }

  // Apply non-email changes immediately (`name` and `languageId`).
  let updatedName: string | undefined;
  let updatedLanguageId: string | null | undefined;
  const directUpdate: Prisma.UserUpdateInput = {};
  if (parsed.data.name !== undefined && parsed.data.name !== me.name) {
    directUpdate.name = parsed.data.name;
  }
  if (parsed.data.languageId !== undefined && parsed.data.languageId !== me.languageId) {
    // Prisma exposes the FK via the `language` relation; set it with
    // connect for an explicit choice and disconnect to clear back to
    // "follow the default".
    directUpdate.language =
      parsed.data.languageId === null
        ? { disconnect: true }
        : { connect: { id: parsed.data.languageId } };
  }
  if (Object.keys(directUpdate).length > 0) {
    const updated = await prisma.user.update({
      where: { id: me.id },
      data: directUpdate,
      select: { name: true, languageId: true },
    });
    updatedName = updated.name;
    updatedLanguageId = updated.languageId;
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
        userId: me.id,
      });
    } catch (err) {
      await logError(err, {
        context: { feature: "profile.email-change", userId: me.id, newEmail },
        userId: me.id,
      });
    }

    pendingEmail = newEmail;
  }

  // Fire-and-forget: any pending task instance whose predicate now
  // matches (e.g. `language_set` after the user picks one here) flips
  // to completed silently. Safe to call even when nothing changed —
  // the hook is internally swallow-and-log.
  void reevaluatePendingInstancesForUser(me.id);

  return NextResponse.json({
    user: {
      id: me.id,
      email: me.email, // unchanged until they confirm
      name: updatedName ?? me.name,
      languageId: updatedLanguageId !== undefined ? updatedLanguageId : me.languageId,
    },
    pendingEmailChange: pendingEmail
      ? { newEmail: pendingEmail, message: `We sent a confirmation link to ${pendingEmail}.` }
      : null,
  });
}
