import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatar: true, avatarMime: true },
  });
  if (!user || !user.avatar || !user.avatarMime) {
    return new Response(null, { status: 404 });
  }
  // The serving URL embeds an ?v={updatedAt} cache-buster, so each version of
  // the avatar lives at a unique URL — safe to cache aggressively.
  return new Response(new Uint8Array(user.avatar), {
    headers: {
      "content-type": user.avatarMime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export const runtime = "nodejs";
