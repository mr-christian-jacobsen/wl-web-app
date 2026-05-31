import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { deleteTagIfUnused, TagInUseError, updateTag } from "@/lib/tags";
import { requireSuperAdmin } from "@/lib/super-admin";
import { updateTagSchema } from "@/lib/validators";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const tag = await updateTag(id, parsed.data);
    return NextResponse.json(tag);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "unknown_category_ids" },
          { status: 400 },
        );
      }
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
    await deleteTagIfUnused(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof TagInUseError) {
      return NextResponse.json(
        { error: "tag_in_use", surveyCount: err.surveyCount },
        { status: 409 },
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    throw err;
  }
}
