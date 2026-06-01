import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createTag, listTagsPage } from "@/lib/tags";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createTagSchema, listTagsQuerySchema } from "@/lib/validators";

export async function GET(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsed = listTagsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const page = await listTagsPage(parsed.data);
  return NextResponse.json(page);
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const tag = await createTag(parsed.data);
    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
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
