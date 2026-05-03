import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/super-admin";
import { SETTING_KEYS, getSmtpSettings, setSetting } from "@/lib/system-settings";
import { updateSmtpSettingsSchema } from "@/lib/validators";

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const settings = await getSmtpSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = updateSmtpSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  await setSetting(SETTING_KEYS.smtpHost, data.host);
  await setSetting(SETTING_KEYS.smtpPort, data.port === null ? null : String(data.port));
  await setSetting(SETTING_KEYS.smtpUser, data.user);
  await setSetting(SETTING_KEYS.smtpFrom, data.from);
  // Only touch the password when an explicit value was supplied; an undefined
  // `pass` means "leave the existing one alone".
  if (data.pass !== undefined) {
    await setSetting(SETTING_KEYS.smtpPass, data.pass);
  }

  const settings = await getSmtpSettings();
  return NextResponse.json({ settings });
}
