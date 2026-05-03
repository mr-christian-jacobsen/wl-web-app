import { describe, expect, it } from "vitest";

import { validateAvatar } from "@/lib/upload";

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe("validateAvatar", () => {
  it("rejects oversized files", () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    big.set(PNG_MAGIC);
    const r = validateAvatar({ mime: "image/png", bytes: big });
    expect(r).toEqual({ error: "too_large" });
  });

  it("rejects disallowed mime types", () => {
    const r = validateAvatar({
      mime: "image/gif",
      bytes: new Uint8Array([0x47, 0x49, 0x46]),
    });
    expect(r).toEqual({ error: "bad_type" });
  });

  it("rejects mime/contents mismatch", () => {
    const r = validateAvatar({ mime: "image/png", bytes: JPG_MAGIC });
    expect(r).toEqual({ error: "mime_mismatch" });
  });

  it("accepts a valid PNG and returns the bytes plus sniffed metadata", () => {
    const r = validateAvatar({ mime: "image/png", bytes: PNG_MAGIC });
    expect("bytes" in r).toBe(true);
    if ("bytes" in r) {
      expect(r.mime).toBe("image/png");
      expect(r.ext).toBe("png");
      expect(r.bytes).toBe(PNG_MAGIC);
    }
  });
});
