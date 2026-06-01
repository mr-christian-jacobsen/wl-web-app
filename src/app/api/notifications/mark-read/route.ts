import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { markNotificationsReadForUser } from "@/lib/notifications";

/**
 * POST /api/notifications/mark-read
 *
 * Bulk mark every unread notification belonging to the signed-in user
 * as read (R16). Fired by the bell when its dropdown opens and by the
 * `/tasks` page on visit.
 *
 * No body — the route is hard-scoped to `session.user.id`. Cross-user
 * enumeration / mutation is structurally impossible because no
 * `userId` / `id` parameter is accepted. Idempotent — a second call
 * with no new unread rows returns `{ marked: 0 }`.
 */
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marked = await markNotificationsReadForUser(session.user.id);
  return NextResponse.json({ ok: true, marked });
}
