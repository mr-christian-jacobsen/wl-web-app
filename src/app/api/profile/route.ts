import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}
