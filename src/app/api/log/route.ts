import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { writeLogEntry } from "@/lib/log.server";
import { clientLogEntrySchema } from "@/lib/validators";

// Cap the request body so a malicious client can't dump a 10 MB stack into
// the table.
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const text = await req.text().catch(() => null);
  if (text === null) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = clientLogEntrySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Anonymous clients are allowed — a JS error before login is real and
  // worth capturing. We attach the userId only when a session exists.
  const session = await auth().catch(() => null);

  await writeLogEntry({
    level: parsed.data.level,
    source: "client",
    name: parsed.data.name ?? null,
    message: parsed.data.message,
    stack: parsed.data.stack ?? null,
    context: parsed.data.context,
    url: parsed.data.url ?? null,
    userAgent: parsed.data.userAgent ?? null,
    userId: session?.user.id ?? null,
  });

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
