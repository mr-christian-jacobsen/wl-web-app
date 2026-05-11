import { NextResponse } from "next/server";

import { pruneLogEntries } from "@/lib/log.prune";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function POST() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await pruneLogEntries();
  return NextResponse.json({ result });
}
