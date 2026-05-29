---
title: Next.js App Router silently 404s on dot-suffixed route folders
date: 2026-05-29
category: docs/solutions/runtime-errors
module: API routes
problem_type: runtime_error
component: tooling
symptoms:
  - "GET /api/openapi.json returns 404 even though src/app/api/openapi.json/route.ts exists and exports GET"
  - "No build error, lint error, or dev-server warning — the route just never registers"
  - "The route handler's code is never reached (no logs, no breakpoints hit)"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags: [nextjs, app-router, routing, "404", route-segment, file-conventions]
---

# Next.js App Router silently 404s on dot-suffixed route folders

## Problem
A route handler placed at `src/app/api/openapi.json/route.ts` returned 404 for every request to `/api/openapi.json`. The file existed, exported a valid `GET`, and produced no errors — Next.js (15.0.3, App Router) simply did not treat the dot-suffixed folder name as a routable segment.

## Symptoms
- `GET /api/openapi.json` → `404` in the dev server log, served as the `_not-found` page.
- `fetch('/api/openapi.json')` returns HTML (the 404 page), not JSON — surfaces downstream as `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
- No compile error, no lint warning, no "route not found" hint. The folder looks like a normal route segment on disk.
- The handler body never executes (no console output from inside `GET`).

## What Didn't Work
- **Verifying the file exists / re-checking the path** — `ls src/app/api/openapi.json/route.ts` confirmed the file was present with a correct `GET` export, which sent the investigation down a "why isn't the file picked up?" dead end. The file was fine; the *folder name* was the problem.
- **Suspecting dev-server route-manifest caching** — restarting the dev server made no difference because the segment was never going to register regardless of cache state.

## Solution
Rename the route folder to drop the dotted extension, and update every reference to the new path.

```text
# Before — never registers as a route
src/app/api/openapi.json/route.ts   →  GET /api/openapi.json  (404)

# After — registers normally
src/app/api/openapi/route.ts        →  GET /api/openapi       (200)
```

The handler itself is unchanged — it still returns JSON via `NextResponse.json(...)`. The content type comes from the response, not the URL extension, so dropping `.json` from the path costs nothing.

References to update after the rename:
- the client/page that fetches the spec (`<ScalarClient specUrl="/api/openapi" />`),
- any test that excludes or asserts the path,
- docs/comments mentioning the old URL.

## Why This Works
Next.js App Router builds routes from **folder names** under `app/`. A folder whose name contains a dot (`openapi.json`) is treated as a literal `dir.ext`-style name rather than a route segment, so no route is generated and requests fall through to the not-found handler. There is no error because "no matching route" is a normal, expected outcome for the router — it can't tell an intentional route folder from an arbitrary directory. Removing the dot makes `openapi` an ordinary dynamic-free segment that maps to `/api/openapi`.

## Prevention
- Never put a dot in an App Router route folder name. If a URL needs to *look* like it has a file extension, use a route that returns the right `Content-Type` instead of encoding the extension in the path, or set a `Content-Disposition` filename in the response.
- When a new App Router route 404s with the file clearly present, suspect the **segment name** (dots, brackets, parentheses, `@` slots) before suspecting caching or the handler.
- Add a coverage/smoke check that hits the route and asserts a non-404 status, so an unroutable segment fails loudly in CI instead of silently serving the 404 page.

## Related Issues
- See `docs/solutions/architecture-patterns/openapi-spec-from-zod-validators.md` — this route serves the generated OpenAPI document, and the rename is why the spec lives at `/api/openapi`.
