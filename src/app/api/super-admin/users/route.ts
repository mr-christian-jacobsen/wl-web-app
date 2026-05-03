import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { TemplateNotFoundError, sendTemplatedEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { requireSuperAdmin } from "@/lib/super-admin";
import { adminCreateUserSchema } from "@/lib/validators";

const INVITATION_TEMPLATE_KEY = "user_invitation";

const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  isSuperAdmin: true,
  createdAt: true,
} as const;

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: SAFE_SELECT,
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = adminCreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        isSuperAdmin: parsed.data.isSuperAdmin ?? false,
      },
      select: SAFE_SELECT,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw err;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  try {
    await sendTemplatedEmail(INVITATION_TEMPLATE_KEY, user.email, {
      name: user.name,
      email: user.email,
      password: parsed.data.password,
      appUrl,
      loginUrl: `${appUrl}/login`,
    });
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      console.warn(
        `[super-admin] No "${INVITATION_TEMPLATE_KEY}" email template found — skipping welcome email for ${user.email}. Create one at /super-admin/email-templates.`,
      );
    } else {
      console.error(`[super-admin] Failed to send welcome email to ${user.email}:`, err);
    }
  }

  return NextResponse.json({ user }, { status: 201 });
}
