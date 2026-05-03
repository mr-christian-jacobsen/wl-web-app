import { NextResponse } from "next/server";

import { EmailNotFoundError, resendEmail } from "@/lib/email";
import { formatEmailSentAt } from "@/lib/format";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  try {
    const updated = await resendEmail(id);
    return NextResponse.json({
      email: {
        id: updated.id,
        status: updated.status,
        error: updated.error,
        sentAt: updated.sentAt.toISOString(),
        sentAtDisplay: formatEmailSentAt(updated.sentAt),
      },
    });
  } catch (err) {
    if (err instanceof EmailNotFoundError) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    throw err;
  }
}
