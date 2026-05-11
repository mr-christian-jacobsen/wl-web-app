import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { LOG_LEVELS, LOG_SOURCES } from "@/lib/log";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function GET(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const levelParam = url.searchParams.get("level");
  const sourceParam = url.searchParams.get("source");
  const where: { level?: string; source?: string } = {};
  if (levelParam && (LOG_LEVELS as readonly string[]).includes(levelParam)) {
    where.level = levelParam;
  }
  if (sourceParam && (LOG_SOURCES as readonly string[]).includes(sourceParam)) {
    where.source = sourceParam;
  }

  const entries = await prisma.logEntry.findMany({
    where,
    orderBy: { lastOccurredAt: "desc" },
    take: 200,
    include: { user: { select: { id: true, email: true } } },
  });
  return NextResponse.json({ entries });
}
