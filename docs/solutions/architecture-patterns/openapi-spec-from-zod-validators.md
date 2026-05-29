---
title: Generate the OpenAPI spec from Zod validators with a drift-detection test
date: 2026-05-29
category: docs/solutions/architecture-patterns
module: API documentation
problem_type: architecture_pattern
component: documentation
severity: medium
applies_when:
  - Documenting an HTTP API whose handlers already validate input with Zod
  - You want API docs that cannot silently drift out of sync with the routes
  - Adding Swagger/Scalar docs to a Next.js App Router project
related_components: [tooling, authentication]
tags: [openapi, swagger, zod, scalar, api-documentation, drift-detection, nextjs]
---

# Generate the OpenAPI spec from Zod validators with a drift-detection test

## Context
The app needed browsable, testable API docs for ~40 `/api/**` routes. A hand-maintained `openapi.yaml` would drift from the code the moment a route changed. Since every handler already validates its request body with Zod schemas in `src/lib/validators.ts`, those schemas can be the single source of truth for the documented request shapes — and a test can guarantee the spec stays complete as routes are added or removed.

## Guidance
Build the spec in code from the existing Zod validators, and guard completeness with a test that walks the route tree.

**Structure** (`src/lib/openapi/`):
- `registry.ts` — one `OpenAPIRegistry` (from `@asteasolutions/zod-to-openapi`), shared error/ok response builders, the `sessionCookie` security scheme, and tag IDs.
- `schemas.ts` — response DTOs registered as named `components.schemas`.
- `register-validators.ts` — registers each schema from `src/lib/validators.ts` under a stable name, kept separate so `validators.ts` stays a pure parsing layer with no doc-tool coupling.
- `routes/*.ts` — one module per area; each calls `registry.registerPath(...)` per `(method, path)` pair, referencing the same Zod schema the handler parses.
- `spec.ts` — calls every `registerXxxRoutes()` (idempotent), then emits the OpenAPI 3.0 document; memoize it.

**Serve + render:**
- `GET /api/openapi` returns the JSON document (admin-gated via the same guard the rest of the protected API uses).
- A docs page mounts a renderer (Scalar) pointed at `/api/openapi`.

**Pin the right library major to your Zod major.** `@asteasolutions/zod-to-openapi` v8 requires Zod 4; on Zod 3 use v7 (`^7.3.x`). Mismatched majors fail the peer-dependency check.

**Drift-detection test** (`tests/unit/openapi-coverage.test.ts`):
- Walk `src/app/api/**/route.ts`, derive each `(method, path)` from the exported HTTP handlers (convert `[param]` → `{param}`).
- Compare against the registered paths in the generated document.
- Fail if any implemented route is undocumented, **and** fail if the spec documents a route that no longer exists.
- Maintain a small, explicit exclusion list (e.g. `/api/auth/[...nextauth]`, the spec endpoint itself) so intentional gaps are visible rather than silently tolerated.

## Why This Matters
Documentation that lives next to the code but isn't enforced rots silently — the first stale endpoint teaches readers to distrust the whole spec. Deriving request schemas from the Zod validators means the documented shape and the validated shape can never disagree (they are the same object). The coverage test converts "someone forgot to document the new route" from a latent quality problem into a failing CI check at the moment the route is added. Together they make the docs trustworthy by construction rather than by discipline.

## When to Apply
- The API already uses Zod (or another schema lib with an OpenAPI bridge) for request validation.
- The route surface is large enough that manual spec maintenance will drift.
- You can express auth as a documented security scheme (here: a session cookie), so "Try it out" works same-origin with the user's existing session.

## Examples
A route registration references the same schema the handler parses, so the documented body and the enforced body are one definition:

```ts
// src/lib/openapi/routes/admin-users.ts
registry.registerPath({
  method: "post",
  path: "/api/super-admin/users",
  tags: [TAGS.AdminUsers],
  security: [{ sessionCookie: [] }],
  request: {
    body: { content: { "application/json": { schema: adminCreateUserSchema } } },
  },
  responses: { /* 201 + error shapes */ },
});
```

The coverage test is what keeps it honest:

```ts
// fails when a (method, path) is implemented but undocumented, or vice versa
const documented = new Set(/* paths from getOpenApiDocument() */);
const implemented = new Set(/* (method, url) from walking src/app/api/**/route.ts */);
expect([...implemented].filter((k) => !documented.has(k))).toEqual([]);
```

Adding an endpoint is now a three-step contract: implement the route, add one `registerPath` block, and the test passes. Skip the block and CI fails with the exact missing `(method, path)`.

## Related
- `docs/solutions/tooling-decisions/swagger-ui-react-to-scalar-react19.md` — the renderer used for the generated spec.
- `docs/solutions/runtime-errors/nextjs-app-router-dot-suffixed-route-folder-404.md` — why the spec endpoint is `/api/openapi`, not `/api/openapi.json`.
