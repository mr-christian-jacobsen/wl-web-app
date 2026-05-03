import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { hashIp, ipFromHeaders, recordHeartbeat } from "@/lib/usage";

const bodySchema = z
  .object({
    screenWidth: z.number().int().positive().max(20000).optional(),
    screenHeight: z.number().int().positive().max(20000).optional(),
    viewportWidth: z.number().int().positive().max(20000).optional(),
    viewportHeight: z.number().int().positive().max(20000).optional(),
    timezone: z.string().max(64).optional(),
    language: z.string().max(32).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent");
  const ip = ipFromHeaders(req.headers);

  await recordHeartbeat({
    userId: session.user.id,
    userAgent: ua,
    ipHash: hashIp(ip),
    ...parsed.data,
  });

  return NextResponse.json({ ok: true });
}
