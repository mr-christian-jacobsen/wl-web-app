import { rm } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { saveAvatar } from "@/lib/upload";

const TMP = path.resolve(process.cwd(), "tests/.tmp-uploads");
process.env.UPLOAD_DIR = TMP;

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe("saveAvatar", () => {
  afterAll(() => rm(TMP, { recursive: true, force: true }));

  it("rejects oversized files", async () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    big.set(PNG_MAGIC);
    const r = await saveAvatar({ mime: "image/png", bytes: big });
    expect(r).toEqual({ error: "too_large" });
  });

  it("rejects disallowed mime types", async () => {
    const r = await saveAvatar({ mime: "image/gif", bytes: new Uint8Array([0x47, 0x49, 0x46]) });
    expect(r).toEqual({ error: "bad_type" });
  });

  it("rejects mime/contents mismatch", async () => {
    const r = await saveAvatar({ mime: "image/png", bytes: JPG_MAGIC });
    expect(r).toEqual({ error: "mime_mismatch" });
  });

  it("saves a valid PNG and returns a public URL", async () => {
    const r = await saveAvatar({ mime: "image/png", bytes: PNG_MAGIC });
    expect("url" in r).toBe(true);
    if ("url" in r) {
      expect(r.url.startsWith("/uploads/")).toBe(true);
      expect(r.url.endsWith(".png")).toBe(true);
    }
  });
});
