import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createSurveySchema } from "@/lib/validators";

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const surveys = await prisma.survey.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      published: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { steps: true } },
    },
  });

  return NextResponse.json({
    surveys: surveys.map(({ _count, ...rest }) => ({ ...rest, stepCount: _count.steps })),
  });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createSurveySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const survey = await prisma.survey.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
    },
    select: {
      id: true,
      name: true,
      description: true,
      published: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ survey: { ...survey, stepCount: 0 } }, { status: 201 });
}
