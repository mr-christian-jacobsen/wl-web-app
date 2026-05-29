---
title: Use Scalar instead of swagger-ui-react for OpenAPI docs on React 19
date: 2026-05-29
category: docs/solutions/tooling-decisions
module: API documentation UI
problem_type: tooling_decision
component: tooling
severity: low
applies_when:
  - Rendering an OpenAPI/Swagger spec in a React 19 / Next.js 15 app
  - Seeing UNSAFE_componentWillReceiveProps or other legacy-lifecycle console warnings from a docs viewer
  - Choosing an OpenAPI rendering library for a new project on a modern React
related_components: [documentation]
tags: [swagger-ui-react, scalar, react-19, nextjs, openapi, strict-mode]
---

# Use Scalar instead of swagger-ui-react for OpenAPI docs on React 19

## Context
The API docs page mounted `swagger-ui-react` to render the generated OpenAPI spec. It worked, but under React 19 (RC) with strict mode it flooded the console with legacy-lifecycle warnings:

```
Using UNSAFE_componentWillReceiveProps in strict mode is not recommended ...
Please update the following components: ModelCollapse
```

`swagger-ui-react` is built from class components that still use `UNSAFE_componentWillReceiveProps` / `componentWillReceiveProps`. Those methods are deprecated, and React 19's strict mode reports them as console noise. The package also emits peer-dependency warnings on install because it targets React 15–18, not 19.

## Guidance
Prefer **`@scalar/api-reference-react`** (Scalar) to render OpenAPI specs in a React 19 / Next 15 app. It consumes the same OpenAPI 3.0 document, has no deprecated-lifecycle warnings, and ships a cleaner default UI.

Swap shape used here:

```tsx
// scalar-client.tsx
"use client";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export function ScalarClient({ specUrl }: { specUrl: string }) {
  return (
    <ApiReferenceReact
      configuration={{ url: specUrl, theme: "default", hideClientButton: true }}
    />
  );
}
```

```tsx
// page.tsx (server component) — admin gate handled by the layout
import { ScalarClient } from "./scalar-client";
export default function ApiDocsPage() {
  return <ScalarClient specUrl="/api/openapi" />;
}
```

Install/remove:

```bash
pnpm remove swagger-ui-react @types/swagger-ui-react
pnpm add @scalar/api-reference-react
```

Everything else — the spec endpoint, the admin gate, the nav link — stays identical. Scalar runs same-origin against the spec URL and the routes it describes, so an existing session cookie is sent automatically for "Try it out" (no extra request interceptor needed, unlike swagger-ui-react which required `requestInterceptor` to set `credentials: "include"`).

## Why This Matters
"Console noise" is not cosmetic: a docs viewer that logs deprecation warnings on every render trains the team to ignore the console, which buries real warnings and errors. The library is also pinned to an older React major, so on React 19 you are running outside its supported range and accumulating peer-dep risk for any future upgrade. Choosing a library that targets current React removes both problems at once and happens to improve the UI.

## When to Apply
- New work that renders OpenAPI/Swagger docs on React 19 or Next 15.
- Existing `swagger-ui-react` integrations that produce strict-mode lifecycle warnings.
- Any place where a third-party React component library is emitting `UNSAFE_*` warnings — evaluate a maintained alternative rather than suppressing the warning.

## Examples
Before — `swagger-ui-react` needed a request interceptor just to forward the session cookie, and still warned:

```tsx
<SwaggerUI
  url={specUrl}
  requestInterceptor={(req) => { req.credentials = "include"; return req; }}
/>
// console: UNSAFE_componentWillReceiveProps in strict mode ... ModelCollapse
```

After — Scalar, same spec, clean console, cookie sent automatically:

```tsx
<ApiReferenceReact configuration={{ url: specUrl, theme: "default" }} />
```

## Related
- `docs/solutions/architecture-patterns/openapi-spec-from-zod-validators.md` — how the spec Scalar renders is generated.
- `docs/solutions/runtime-errors/nextjs-app-router-dot-suffixed-route-folder-404.md` — why the spec is served at `/api/openapi`.
