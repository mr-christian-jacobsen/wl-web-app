import { NextResponse } from "next/server";

import { sendTestEmail } from "@/lib/email";
import { requireSuperAdmin } from "@/lib/super-admin";
import { testEmailSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = testEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const outcome = await sendTestEmail(parsed.data.to);
  return NextResponse.json({ outcome });
}
