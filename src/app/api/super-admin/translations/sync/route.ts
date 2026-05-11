import { NextResponse } from "next/server";

import { logError } from "@/lib/log.server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { syncTranslationKeys } from "@/lib/translations.server";

/**
 * POST /api/super-admin/translations/sync
 * Reflect the in-code `KNOWN_TRANSLATIONS` registry into the DB,
 * inserting any missing default-language rows. Triggered from the
 * "Sync from code" button on `/super-admin/translations` so admins
 * never have to wait for a redeploy to see new keys.
 */
export async function POST() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  try {
    const result = await syncTranslationKeys();
    return NextResponse.json(result);
  } catch (err) {
    await logError(err, { context: { feature: "super-admin.translations.sync" } });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
