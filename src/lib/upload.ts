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

export type ValidatedAvatar = { mime: string; ext: string; bytes: Uint8Array };
export type AvatarError = { error: "too_large" | "bad_type" | "mime_mismatch" };

function sniff(buf: Uint8Array): { mime: string; ext: string } | null {
  for (const { mime, ext, bytes } of MAGIC) {
    if (bytes.every((b, i) => buf[i] === b)) return { mime, ext };
  }
  return null;
}

/**
 * Validate an avatar upload's size, MIME and magic bytes. Returns the bytes
 * unchanged on success — storage (DB or disk) is the caller's responsibility.
 */
export function validateAvatar(file: {
  mime: string;
  bytes: Uint8Array;
}): ValidatedAvatar | AvatarError {
  if (file.bytes.byteLength > MAX_BYTES) return { error: "too_large" };
  if (!ALLOWED_MIME[file.mime]) return { error: "bad_type" };

  const sniffed = sniff(file.bytes);
  if (!sniffed || sniffed.mime !== file.mime) return { error: "mime_mismatch" };

  return { mime: file.mime, ext: sniffed.ext, bytes: file.bytes };
}

export const AVATAR_MAX_BYTES = MAX_BYTES;
