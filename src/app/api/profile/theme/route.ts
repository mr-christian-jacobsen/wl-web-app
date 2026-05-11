import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { themePreferenceSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = themePreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Persist "system" as null — that's how the schema field is documented
  // (null = system) and means we never have to translate between the two.
  const stored = parsed.data.theme === "system" ? null : parsed.data.theme;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { themePreference: stored },
    select: { id: true },
  });

  return NextResponse.json({ themePreference: stored });
}
