import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireSuperAdmin } from "@/lib/super-admin";
import { adminUpdateUserSchema } from "@/lib/validators";

const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  isSuperAdmin: true,
  createdAt: true,
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = adminUpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (
    id === guard.session.user.id &&
    parsed.data.isSuperAdmin === false
  ) {
    return NextResponse.json(
      { error: "You can't revoke your own super-admin status." },
      { status: 400 },
    );
  }

  if (parsed.data.isSuperAdmin === false) {
    const remainingAdmins = await prisma.user.count({
      where: { isSuperAdmin: true, NOT: { id } },
    });
    if (remainingAdmins === 0) {
      return NextResponse.json(
        { error: "Cannot revoke the last super admin." },
        { status: 400 },
      );
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.isSuperAdmin !== undefined) data.isSuperAdmin = parsed.data.isSuperAdmin;
  if (parsed.data.password !== undefined) data.passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  if (id === guard.session.user.id) {
    return NextResponse.json(
      { error: "You can't delete your own account here." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { isSuperAdmin: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.isSuperAdmin) {
    const remaining = await prisma.user.count({
      where: { isSuperAdmin: true, NOT: { id } },
    });
    if (remaining === 0) {
      return NextResponse.json(
        { error: "Cannot delete the last super admin." },
        { status: 400 },
      );
    }
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
