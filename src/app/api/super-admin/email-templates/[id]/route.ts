import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin";
import { updateEmailTemplateSchema } from "@/lib/validators";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateEmailTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const data: Prisma.EmailTemplateUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.subject !== undefined) data.subject = parsed.data.subject;
  if (parsed.data.bodyText !== undefined) data.bodyText = parsed.data.bodyText;
  if (parsed.data.bodyHtml !== undefined) data.bodyHtml = parsed.data.bodyHtml;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;

  try {
    const template = await prisma.emailTemplate.update({
      where: { id },
      data,
      select: {
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
      },
    });
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
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
    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    throw err;
  }
}
