import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { reorderStepsSchema } from "@/lib/validators";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id: surveyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reorderStepsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true },
  });
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const existing = await prisma.surveyStep.findMany({
    where: { surveyId },
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
      { error: "stepIds must list every step in the survey exactly once" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const [i, id] of submitted.entries()) {
      await tx.surveyStep.update({ where: { id }, data: { position: i } });
    }
    await tx.survey.update({ where: { id: surveyId }, data: { updatedAt: new Date() } });
  });

  return NextResponse.json({ ok: true });
}
