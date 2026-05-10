import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const existing = await prisma.language.findUnique({
    where: { id },
    select: { id: true, isDefault: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Language not found" }, { status: 404 });
  }
  if (existing.isDefault) {
    return NextResponse.json(
      { error: "The default language cannot be deleted" },
      { status: 400 },
    );
  }

  try {
    await prisma.language.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Language not found" }, { status: 404 });
    }
    throw err;
  }
}
