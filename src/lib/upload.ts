import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "public/uploads";
const MAX_BYTES = Number(process.env.MAX_AVATAR_BYTES ?? 2 * 1024 * 1024);

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAGIC: Array<{ ext: string; mime: string; bytes: number[] }> = [
  { ext: "jpg", mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "png", mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "webp", mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

export type UploadResult = { url: string; path: string };
export type UploadError = { error: "too_large" | "bad_type" | "mime_mismatch" };

function sniff(buf: Uint8Array): { mime: string; ext: string } | null {
  for (const { mime, ext, bytes } of MAGIC) {
    if (bytes.every((b, i) => buf[i] === b)) return { mime, ext };
  }
  return null;
}

export async function saveAvatar(
  file: { mime: string; bytes: Uint8Array },
): Promise<UploadResult | UploadError> {
  if (file.bytes.byteLength > MAX_BYTES) return { error: "too_large" };
  if (!ALLOWED_MIME[file.mime]) return { error: "bad_type" };

  const sniffed = sniff(file.bytes);
  if (!sniffed || sniffed.mime !== file.mime) return { error: "mime_mismatch" };

  const dir = path.resolve(process.cwd(), UPLOAD_DIR);
  await mkdir(dir, { recursive: true });

  const filename = `${randomBytes(16).toString("hex")}.${sniffed.ext}`;
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, file.bytes);

  return { url: `/uploads/${filename}`, path: fullPath };
}
