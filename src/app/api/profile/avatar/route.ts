import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveAvatar } from "@/lib/upload";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await saveAvatar({ mime: file.type, bytes });
  if ("error" in result) {
    const messages: Record<typeof result.error, string> = {
      too_large: "File is too large (max 2 MB)",
      bad_type: "Only JPEG, PNG, or WebP images are allowed",
      mime_mismatch: "File contents do not match its declared type",
    };
    return NextResponse.json({ error: messages[result.error] }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarUrl: result.url },
  });

  return NextResponse.json({ avatarUrl: result.url });
}

export const runtime = "nodejs";
