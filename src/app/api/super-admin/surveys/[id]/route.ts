import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { updateSurveySchema } from "@/lib/validators";

const SURVEY_SELECT = {
  id: true,
  name: true,
  description: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const survey = await prisma.survey.findUnique({
    where: { id },
    select: {
      ...SURVEY_SELECT,
      steps: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          type: true,
          title: true,
          notes: true,
          options: true,
        },
      },
    },
  });

  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  return NextResponse.json({ survey });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateSurveySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const data: Prisma.SurveyUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;

  try {
    const survey = await prisma.survey.update({
      where: { id },
      data,
      select: SURVEY_SELECT,
    });
    return NextResponse.json({ survey });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    await prisma.survey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    throw err;
  }
}
