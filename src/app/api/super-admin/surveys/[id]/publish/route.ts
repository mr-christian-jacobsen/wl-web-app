import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { stepTypeRequiresOptions, parseOptions } from "@/lib/step-types";
import { requireSuperAdmin } from "@/lib/super-admin";
import { setPublishedSchema } from "@/lib/validators";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = setPublishedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const survey = await prisma.survey.findUnique({
    where: { id },
    select: {
      id: true,
      published: true,
      publishedAt: true,
      steps: { select: { type: true, options: true } },
    },
  });
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  // Going public — refuse if the form would render in a broken state.
  if (parsed.data.published) {
    if (survey.steps.length === 0) {
      return NextResponse.json(
        { error: "Add at least one step before publishing" },
        { status: 400 },
      );
    }
    const badChoice = survey.steps.find(
      (s) => stepTypeRequiresOptions(s.type) && parseOptions(s.options).length < 2,
    );
    if (badChoice) {
      return NextResponse.json(
        { error: "Every choice step needs at least two options" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.survey.update({
    where: { id },
    data: {
      published: parsed.data.published,
      publishedAt:
        parsed.data.published && !survey.publishedAt ? new Date() : survey.publishedAt,
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

  return NextResponse.json({ survey: updated });
}
