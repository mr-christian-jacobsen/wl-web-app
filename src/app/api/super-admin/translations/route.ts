import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { logError } from "@/lib/log.server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { setTranslation } from "@/lib/translations.server";
import { updateTranslationSchema } from "@/lib/validators";

/**
 * PATCH /api/super-admin/translations
 * Upsert one translation row for (`translationKeyId`, `languageId`).
 * No DELETE endpoint — translations can be set to an empty string,
 * which makes the lookup fall back to the default language value, but
 * rows are never removed via the UI.
 */
export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = updateTranslationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Guard the foreign keys upfront so we can return friendly 400s
  // instead of letting a P2003 bubble up from Prisma.
  const [key, language] = await Promise.all([
    prisma.translationKey.findUnique({
      where: { id: parsed.data.translationKeyId },
      select: { id: true },
    }),
    prisma.language.findUnique({
      where: { id: parsed.data.languageId },
      select: { id: true },
    }),
  ]);
  if (!key) return NextResponse.json({ error: "Unknown translation key" }, { status: 400 });
  if (!language) return NextResponse.json({ error: "Unknown language" }, { status: 400 });

  try {
    const translation = await setTranslation(parsed.data);
    return NextResponse.json({ translation });
  } catch (err) {
    await logError(err, {
      context: { feature: "super-admin.translations.set", ...parsed.data },
    });
    return NextResponse.json({ error: "Could not save translation" }, { status: 500 });
  }
}
