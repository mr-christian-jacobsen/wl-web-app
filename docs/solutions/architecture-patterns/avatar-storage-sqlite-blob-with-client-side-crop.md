---
title: Store avatars as SQLite BLOBs with a client-side square crop
date: 2026-05-29
category: docs/solutions/architecture-patterns
module: Profile / Avatars
problem_type: architecture_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - "Storing small per-user binary assets (avatars, signatures, thumbnails) that should share the DB's backup and deletion lifecycle"
  - "A self-hosted single-node app where the DB is already the source of truth and you want to avoid a separate object store or local upload directory"
  - "You need a crop/compress step before persisting an image and want the crop UX to match the bytes you actually save"
related_components:
  - database
  - service_object
tags:
  - avatars
  - prisma
  - sqlite
  - blob
  - react-easy-crop
  - nextjs-route-handler
  - image-upload
---

# Store avatars as SQLite BLOBs with a client-side square crop

## Context

Avatars were originally written to files under `public/uploads/`. That created three problems for a single-node Next.js + Prisma + SQLite app:

- **Separate backup surface** — the DB and the upload directory had to be backed up and restored together or the app would render broken images. Two sources of truth, two failure modes.
- **Orphaned files** — deleting a user removed the row but left the file on disk. Nothing reconciled the filesystem against the table, so storage leaked over time.
- **No crop UX** — uploads were stored as-is, so avatars rendered at arbitrary aspect ratios and the UI had no way to let users frame their image.

The decision was to make the database the single owner of avatar bytes and to do the cropping/compression on the client before anything is persisted.

## Guidance

Store the image bytes directly in the user row and serve them through a dedicated route handler. Crop and JPEG-encode on the client so the upload payload is already small and already the shape you save.

**1. Schema — bytes live in the row.** Add two columns to `User` and keep the existing URL column pointing at the serving route:

```prisma
model User {
  // Public URL the UI renders, e.g. /api/avatar/{id}?v={updatedAtMs}
  avatarUrl  String?
  // Cropped + JPEG-encoded bytes, written by the avatar upload handler.
  avatar     Bytes?
  // Mime type of `avatar` — needed to set content-type on the GET route.
  avatarMime String?
}
```

Keeping `avatarUrl` means the rest of the UI doesn't change — it still reads one string field. The field now resolves to `/api/avatar/{id}` instead of `/uploads/{file}`, with a `?v=` cache-buster appended so each version lives at a unique URL.

**2. Crop on the client with a SQUARE mask.** The `AvatarCropper` component (`src/components/profile/AvatarCropper.tsx`) uses `react-easy-crop`. The crop mask must be **square**, because the saved output is square. A round mask is a UX trap: the user frames a circle, but the bytes on disk are a square and the corners they thought were cropped away are still stored — and may reappear anywhere the avatar is shown without a CSS circle. **Make the mask match the saved geometry.**

**3. Encode to JPEG on a canvas before upload.** Draw the cropped region onto a `<canvas>` and export with `canvas.toBlob(..., "image/jpeg", quality)`. This compresses client-side, so the request body is a small JPEG rather than the original (possibly multi-MB) PNG. Send those bytes to the upload endpoint, which writes `avatar` + `avatarMime` and refreshes `avatarUrl`.

**4. Serve the blob from a Node route handler.** `src/app/api/avatar/[id]/route.ts` reads the row and returns the bytes with the stored content-type:

```ts
const user = await prisma.user.findUnique({
  where: { id },
  select: { avatar: true, avatarMime: true },
});
if (!user || !user.avatar || !user.avatarMime) {
  return new Response(null, { status: 404 });
}
// Buffer -> Uint8Array so it satisfies BodyInit under strict TS.
return new Response(new Uint8Array(user.avatar), {
  headers: {
    "content-type": user.avatarMime,
    "cache-control": "public, max-age=31536000, immutable",
  },
});
```

Pin `export const runtime = "nodejs"` — Prisma's `Bytes` come back as a Node `Buffer`, which the edge runtime won't give you. Because the serving URL carries a `?v={updatedAt}` cache-buster, every version is a distinct URL and can be cached `immutable` for a year.

**TypeScript gotcha:** Prisma types `Bytes` as `Buffer`. Passing a `Buffer` straight into `new Response(...)` fails strict typechecking because `Buffer` is not assignable to `BodyInit`. Wrap it: `new Response(new Uint8Array(user.avatar), ...)`. The `Uint8Array` view is zero-copy over the same memory, so there's no real cost.

## Why This Matters

- **One backup, one lifecycle.** Bytes live in the row, so a DB snapshot is a complete, consistent backup. Deleting the user deletes the avatar atomically — no orphan reconciliation job, no leaked storage.
- **No filesystem coupling.** `public/uploads/` was removed entirely. The app no longer assumes a writable, persistent local directory, which matters for ephemeral/containerized deploys.
- **Smaller, predictable payloads.** Client-side crop + JPEG keeps row size bounded and the upload fast, instead of storing whatever the user happened to pick.
- **Honest crop UX.** A mask that matches the saved geometry means what the user frames is what is stored and shown — no surprise corners.

The trade-offs to respect: SQLite BLOBs are a good fit for small, bounded assets (avatars are tens of KB after JPEG). This pattern does **not** generalize to large files, many-MB media, or high write-throughput galleries — at that scale the row bloat, lack of HTTP range support, and DB cache pressure argue for object storage. The deciding factor here was that avatars are small and single-node SQLite is already the source of truth.

## When to Apply

- The asset is small and bounded (avatars, signatures, small thumbnails).
- You want the asset's backup and deletion to follow the DB row automatically.
- You're on single-node SQLite (or any DB you already back up) and want to avoid standing up object storage.
- A crop/compress step is desirable before persistence.

Do **not** apply for large media, streaming, range requests, or high write volumes — reach for object storage and store only a URL.

## Examples

Before — filesystem storage:

```
public/uploads/<userId>.png          # bytes on disk
User.avatarUrl = "/uploads/<id>.png" # points at the file
# delete user -> file leaks; restore -> must restore DB + dir together
```

After — DB BLOB storage:

```
User.avatar     = <jpeg bytes>             # in the row
User.avatarMime = "image/jpeg"
User.avatarUrl  = "/api/avatar/<id>?v=<ms>" # points at the route
# delete user -> bytes gone with the row; one backup covers everything
```

Mask geometry (the load-bearing UX decision):

```
saved output: SQUARE  ->  crop mask: SQUARE   (honest: framed == stored)
saved output: SQUARE  ->  crop mask: ROUND    (trap: corners still stored)
```

## Related

- `prisma/schema.prisma` — `User.avatar`, `User.avatarMime`, `User.avatarUrl`
- `src/app/api/avatar/[id]/route.ts` — blob serving route (Node runtime, Buffer -> Uint8Array cast)
- `src/components/profile/AvatarCropper.tsx` — `react-easy-crop` square-mask cropper + canvas JPEG encode
- CLAUDE.md > "DB normalisation" — note that string-trimming write extension skips binary fields; `avatar`/`avatarMime` are unaffected
