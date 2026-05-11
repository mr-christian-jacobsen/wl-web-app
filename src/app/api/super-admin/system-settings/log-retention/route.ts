import { NextResponse } from "next/server";

import { pruneLogEntries } from "@/lib/log.prune";
import { requireSuperAdmin } from "@/lib/super-admin";
import { SETTING_KEYS, getLogRetention, setSetting } from "@/lib/system-settings";
import { updateLogRetentionSchema } from "@/lib/validators";

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const retention = await getLogRetention();
  return NextResponse.json({ retention });
}

export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = updateLogRetentionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  await setSetting(SETTING_KEYS.logRetentionErrorDays, String(parsed.data.errorDays));
  await setSetting(SETTING_KEYS.logRetentionWarningDays, String(parsed.data.warningDays));
  await setSetting(SETTING_KEYS.logRetentionInfoDays, String(parsed.data.infoDays));

  const retention = await getLogRetention();
  return NextResponse.json({ retention });
}
