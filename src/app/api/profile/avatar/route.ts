import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateAvatar } from "@/lib/upload";

function buildAvatarUrl(userId: string, version: number): string {
  return `/api/avatar/${userId}?v=${version}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = validateAvatar({ mime: file.type, bytes });
  if ("error" in result) {
    const messages: Record<typeof result.error, string> = {
      too_large: "File is too large (max 2 MB)",
      bad_type: "Only JPEG, PNG, or WebP images are allowed",
      mime_mismatch: "File contents do not match its declared type",
    };
    return NextResponse.json({ error: messages[result.error] }, { status: 400 });
  }

  // Two-step write: store bytes first to get a fresh updatedAt, then build the
  // cache-busted URL from it. We could compute the URL inline using Date.now()
  // but tying it to updatedAt keeps it deterministic with what's in the DB.
  const stored = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      avatar: Buffer.from(result.bytes),
      avatarMime: result.mime,
    },
    select: { id: true, updatedAt: true },
  });

  const avatarUrl = buildAvatarUrl(stored.id, stored.updatedAt.getTime());
  await prisma.user.update({
    where: { id: stored.id },
    data: { avatarUrl },
    select: { id: true },
  });

  return NextResponse.json({ avatarUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatar: null, avatarMime: null, avatarUrl: null },
    select: { id: true },
  });

  return NextResponse.json({ avatarUrl: null });
}

export const runtime = "nodejs";
