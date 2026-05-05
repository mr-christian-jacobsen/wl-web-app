import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reorderStepsSchema } from "@/lib/validators";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: flowId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reorderStepsSchema.safeParse(body);
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

  const existing = await prisma.flowStep.findMany({
    where: { flowId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((s) => s.id));
  const submitted = parsed.data.stepIds;

  if (
    submitted.length !== existingIds.size ||
    submitted.some((id) => !existingIds.has(id)) ||
    new Set(submitted).size !== submitted.length
  ) {
    return NextResponse.json(
      { error: "stepIds must list every step in the flow exactly once" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const [i, id] of submitted.entries()) {
      await tx.flowStep.update({ where: { id }, data: { position: i } });
    }
    await tx.flow.update({ where: { id: flowId }, data: { updatedAt: new Date() } });
  });

  return NextResponse.json({ ok: true });
}
