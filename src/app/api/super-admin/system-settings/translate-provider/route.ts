import { NextResponse } from "next/server";

import { logError } from "@/lib/log.server";
import { requireSuperAdmin } from "@/lib/super-admin";
import {
  SETTING_KEYS,
  getTranslateSettings,
  setSetting,
} from "@/lib/system-settings";
import { updateTranslateSettingsSchema } from "@/lib/validators";

/**
 * GET — return the UI-safe view of the current settings (provider +
 * model + presence flag for each API key).
 * PATCH — update provider + models. API keys follow the SMTP
 * convention: `""` = leave the existing key untouched, `null` = clear
 * it, any string = overwrite.
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const settings = await getTranslateSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = updateTranslateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    await setSetting(SETTING_KEYS.translateProvider, parsed.data.provider);
    if (parsed.data.anthropicModel !== undefined) {
      await setSetting(
        SETTING_KEYS.translateAnthropicModel,
        parsed.data.anthropicModel.length > 0 ? parsed.data.anthropicModel : null,
      );
    }
    if (parsed.data.openaiModel !== undefined) {
      await setSetting(
        SETTING_KEYS.translateOpenaiModel,
        parsed.data.openaiModel.length > 0 ? parsed.data.openaiModel : null,
      );
    }
    if (parsed.data.anthropicApiKey !== undefined) {
      await setSetting(SETTING_KEYS.translateAnthropicApiKey, parsed.data.anthropicApiKey);
    }
    if (parsed.data.openaiApiKey !== undefined) {
      await setSetting(SETTING_KEYS.translateOpenaiApiKey, parsed.data.openaiApiKey);
    }

    const settings = await getTranslateSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    await logError(err, {
      context: { feature: "super-admin.translate-provider.update" },
    });
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }
}
