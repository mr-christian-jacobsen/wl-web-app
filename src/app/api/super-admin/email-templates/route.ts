import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ensureDefaultLanguage } from "@/lib/languages";
import { requireSuperAdmin } from "@/lib/super-admin";
import { createEmailTemplateSchema } from "@/lib/validators";

const TEMPLATE_SELECT = {
  id: true,
  key: true,
  languageId: true,
  name: true,
  subject: true,
  bodyText: true,
  bodyHtml: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  // Make sure the default language row exists before listing — first-run
  // databases otherwise have no language to associate new templates with.
  await ensureDefaultLanguage();

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: TEMPLATE_SELECT,
  });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createEmailTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Verify the language row exists — Prisma would surface a P2003 (FK
  // violation) but the message is opaque, so we check upfront.
  const language = await prisma.language.findUnique({
    where: { id: parsed.data.languageId },
    select: { id: true },
  });
  if (!language) {
    return NextResponse.json({ error: "Unknown language" }, { status: 400 });
  }

  try {
    const template = await prisma.emailTemplate.create({
      data: {
        key: parsed.data.key,
        languageId: parsed.data.languageId,
        name: parsed.data.name,
        subject: parsed.data.subject,
        bodyText: parsed.data.bodyText,
        bodyHtml: parsed.data.bodyHtml ?? null,
        description: parsed.data.description ?? null,
      },
      select: TEMPLATE_SELECT,
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A template for that key already exists in this language" },
        { status: 409 },
      );
    }
    throw err;
  }
}
