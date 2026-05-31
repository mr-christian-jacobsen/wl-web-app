import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { createCategory, listCategoriesWithCount } from "@/lib/categories";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createCategorySchema } from "@/lib/validators";

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const categories = await listCategoriesWithCount();

  return NextResponse.json({
    items: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt.toISOString(),
      tagCount: c._count.assignments,
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const category = await createCategory(parsed.data);
    return NextResponse.json(
      {
        id: category.id,
        name: category.name,
        description: category.description,
        createdAt: category.createdAt.toISOString(),
        tagCount: 0,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "duplicate_name" }, { status: 409 });
    }
    throw err;
  }
}
