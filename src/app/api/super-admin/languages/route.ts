import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createLanguageSchema } from "@/lib/validators";

const LANGUAGE_SELECT = {
  id: true,
  countryCode: true,
  languageCode: true,
  isDefault: true,
  createdAt: true,
} as const;

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  await ensureDefaultLanguage();

  const languages = await prisma.language.findMany({
    select: LANGUAGE_SELECT,
    // Default row first, then alphabetical by country code so the list
    // is stable across reloads.
    orderBy: [{ isDefault: "desc" }, { countryCode: "asc" }, { languageCode: "asc" }],
  });

  return NextResponse.json({
    languages: languages.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createLanguageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const language = await prisma.language.create({
      data: {
        countryCode: parsed.data.countryCode,
        languageCode: parsed.data.languageCode,
      },
      select: LANGUAGE_SELECT,
    });
    return NextResponse.json(
      { language: { ...language, createdAt: language.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "That country/language combination already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}
