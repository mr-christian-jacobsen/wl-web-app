import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { updateStepSchema } from "@/lib/validators";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id: surveyId, stepId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const owned = await prisma.surveyStep.findFirst({
    where: { id: stepId, surveyId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  const data: Prisma.SurveyStepUpdateInput = {};
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const step = await prisma.$transaction(async (tx) => {
    const updated = await tx.surveyStep.update({
      where: { id: stepId },
      data,
      select: { id: true, position: true, type: true, title: true, notes: true },
    });
    await tx.survey.update({ where: { id: surveyId }, data: { updatedAt: new Date() } });
    return updated;
  });

  return NextResponse.json({ step });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id: surveyId, stepId } = await params;
  const owned = await prisma.surveyStep.findFirst({
    where: { id: stepId, surveyId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.surveyStep.delete({ where: { id: stepId } });
    const remaining = await tx.surveyStep.findMany({
      where: { surveyId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    for (const [i, row] of remaining.entries()) {
      await tx.surveyStep.update({ where: { id: row.id }, data: { position: i } });
    }
    await tx.survey.update({ where: { id: surveyId }, data: { updatedAt: new Date() } });
  });

  return NextResponse.json({ ok: true });
}
