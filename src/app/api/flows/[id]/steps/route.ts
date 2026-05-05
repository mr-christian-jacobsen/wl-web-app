import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createStepSchema } from "@/lib/validators";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: flowId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const flow = await prisma.flow.findFirst({
    where: { id: flowId, userId: session.user.id },
    select: { id: true },
  });
  if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });

  const step = await prisma.$transaction(async (tx) => {
    const last = await tx.flowStep.findFirst({
      where: { flowId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = last ? last.position + 1 : 0;
    const created = await tx.flowStep.create({
      data: {
        flowId,
        position,
        type: parsed.data.type,
        title: parsed.data.title,
        notes: parsed.data.notes,
      },
      select: { id: true, position: true, type: true, title: true, notes: true },
    });
    await tx.flow.update({ where: { id: flowId }, data: { updatedAt: new Date() } });
    return created;
  });

  return NextResponse.json({ step }, { status: 201 });
}
