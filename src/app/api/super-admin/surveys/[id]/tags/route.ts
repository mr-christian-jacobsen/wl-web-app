import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireSuperAdmin } from "@/lib/super-admin";
import {
  UnknownTagIdsError,
  getSurveyTagIds,
  replaceSurveyTags,
} from "@/lib/tags";
import { replaceSurveyTagsSchema } from "@/lib/validators";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const tagIds = await getSurveyTagIds(id);
  return NextResponse.json({ tagIds });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = replaceSurveyTagsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    await replaceSurveyTags(id, parsed.data.tagIds);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnknownTagIdsError) {
      return NextResponse.json(
        { error: "unknown_tag_ids", unknown: err.unknown },
        { status: 400 },
      );
    }
    // Backstop for the TOCTOU window: a tag was deleted between our
    // in-transaction existence check and the createMany commit, OR the
    // survey itself doesn't exist (the SurveyTag.surveyId FK is
    // Cascade so a missing parent also raises P2003 on insert). Map
    // both to the same safe 400 shape — callers shouldn't need to
    // disambiguate.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json({ error: "unknown_tag_ids" }, { status: 400 });
    }
    throw err;
  }
}
