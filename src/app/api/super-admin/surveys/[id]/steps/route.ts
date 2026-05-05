import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createStepSchema, normalizeOptionsForType } from "@/lib/validators";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id: surveyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const optionsResult = normalizeOptionsForType(parsed.data.type, parsed.data.options);
  if (!optionsResult.ok) {
    return NextResponse.json({ error: optionsResult.error }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true },
  });
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const step = await prisma.$transaction(async (tx) => {
    const last = await tx.surveyStep.findFirst({
      where: { surveyId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = last ? last.position + 1 : 0;
    const created = await tx.surveyStep.create({
      data: {
        surveyId,
        position,
        type: parsed.data.type,
        title: parsed.data.title,
        notes: parsed.data.notes,
        options: optionsResult.value,
      },
      select: {
        id: true,
        position: true,
        type: true,
        title: true,
        notes: true,
        options: true,
      },
    });
    await tx.survey.update({ where: { id: surveyId }, data: { updatedAt: new Date() } });
    return created;
  });

  return NextResponse.json({ step }, { status: 201 });
}
