import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createSurveyWithUniqueSlug } from "@/lib/survey-slug";
import { createSurveySchema } from "@/lib/validators";

const SUMMARY_SELECT = {
  id: true,
  publicSlug: true,
  name: true,
  description: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const surveys = await prisma.survey.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      ...SUMMARY_SELECT,
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

  const survey = await createSurveyWithUniqueSlug({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
    select: SUMMARY_SELECT,
  });

  return NextResponse.json({ survey: { ...survey, stepCount: 0 } }, { status: 201 });
}
