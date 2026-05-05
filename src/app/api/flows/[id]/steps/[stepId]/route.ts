import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateStepSchema } from "@/lib/validators";

async function ensureStepOwned(userId: string, flowId: string, stepId: string) {
  return prisma.flowStep.findFirst({
    where: { id: stepId, flowId, flow: { userId } },
    select: { id: true, position: true, flowId: true },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: flowId, stepId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const owned = await ensureStepOwned(session.user.id, flowId, stepId);
  if (!owned) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  const data: Prisma.FlowStepUpdateInput = {};
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const step = await prisma.$transaction(async (tx) => {
    const updated = await tx.flowStep.update({
      where: { id: stepId },
      data,
      select: { id: true, position: true, type: true, title: true, notes: true },
    });
    await tx.flow.update({ where: { id: flowId }, data: { updatedAt: new Date() } });
    return updated;
  });

  return NextResponse.json({ step });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: flowId, stepId } = await params;
  const owned = await ensureStepOwned(session.user.id, flowId, stepId);
  if (!owned) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  // Compact remaining positions so the 0..N-1 invariant holds.
  await prisma.$transaction(async (tx) => {
    await tx.flowStep.delete({ where: { id: stepId } });
    const remaining = await tx.flowStep.findMany({
      where: { flowId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    for (const [i, row] of remaining.entries()) {
      await tx.flowStep.update({ where: { id: row.id }, data: { position: i } });
    }
    await tx.flow.update({ where: { id: flowId }, data: { updatedAt: new Date() } });
  });

  return NextResponse.json({ ok: true });
}
