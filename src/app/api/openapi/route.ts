import { NextResponse } from "next/server";

import { getOpenApiDocument } from "@/lib/openapi/spec";
import { requireSuperAdmin } from "@/lib/super-admin";

// Admin-gated so the spec — which enumerates every internal endpoint and
// its schemas — isn't exposed publicly. The /super-admin/api-docs page is
// also admin-gated, so the browser will already have the cookie when
// Swagger UI fetches this URL. Path is `/api/openapi` (no extension)
// because Next.js App Router doesn't treat `dir.ext`-style folder names
// as static route segments.
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const doc = getOpenApiDocument();
  return NextResponse.json(doc);
}
