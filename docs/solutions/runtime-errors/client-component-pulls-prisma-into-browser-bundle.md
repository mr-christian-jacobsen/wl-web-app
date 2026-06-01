---
title: A `'use client'` component importing a server-only registry pulls Prisma into the browser bundle
date: 2026-06-01
id: SOL-2026-012
status: active
category: docs/solutions/runtime-errors
module: bundling
problem_type: build_error
component: tooling
symptoms:
  - "`pnpm build` fails with `Module not found: Can't resolve 'net' / 'dns' / 'fs' / 'tls'` from a file inside `node_modules/@prisma/client`"
  - "`pnpm dev` works (the dev server is forgiving about Node-only imports in client modules); the failure only surfaces at production build time"
  - "Typecheck passes — TypeScript is happy because the types resolve; the bundler is the layer that breaks"
  - "Stack trace points at the Prisma client entry, not at the client component that imported the offending registry — the actual broken import sits 2-3 hops upstream"
root_cause: code_smell
resolution_type: code_fix
severity: medium
tags: [app-router, bundling, client-component, nextjs, prisma, registry]
---

# A `'use client'` component importing a server-only registry pulls Prisma into the browser bundle

## Problem

Implementation Unit U7 of the tasks-and-notifications feature added `AdminTaskEditor.tsx` (a `'use client'` component) which imported `KNOWN_PREDICATES` from `src/lib/predicates.ts` to render the predicate dropdown. The predicate registry was structured as a typed const tuple — `{ key, name, description, deepLinkPath?, evaluate }` — where the `evaluate` closures held per-predicate Prisma queries. Local development worked, `pnpm typecheck` passed, every unit test stayed green. `pnpm build` then failed at the very end of the implementation pass with:

```text
Module not found: Can't resolve 'net'
Import trace for requested module:
  ./node_modules/@prisma/client/runtime/library.js
  ./src/lib/predicates.ts
  ./src/components/tasks/AdminTaskEditor.tsx
```

The diagnostic was that webpack, when bundling `AdminTaskEditor` for the browser, followed `import { KNOWN_PREDICATES } from '@/lib/predicates'` even though the editor only used the static `key`/`name`/`description`/`deepLinkPath` fields and never invoked the `evaluate` closure. The closures reference `prisma`, and Prisma's runtime references `net`/`dns`/`fs`/`tls` — Node-only modules with no browser polyfill.

## Symptoms

- `pnpm build` fails with `Module not found: Can't resolve 'net'` (or `'dns'`, `'fs'`, `'tls'`) from inside `node_modules/@prisma/client/runtime/library.js`.
- The import trace surfaces the offending client component on its second or third line — read it bottom-up to find the actual culprit file.
- `pnpm dev` keeps working: Next.js dev-mode does not enforce the same bundle boundary that production builds do, so the problem is invisible until the first production build.
- `pnpm typecheck` is green because the types are perfectly resolvable; the broken constraint is at the bundler layer, not the type layer.
- The error message names Prisma but the *real* cause is "a static catalog and its runtime evaluator share the same module".

## What didn't work

- **Adding `serverExternalPackages: ['@prisma/client']` to `next.config.ts`** — that flag only excludes Prisma from server-side bundles (RSC, server actions). It does nothing for the client bundle. webpack still follows the import chain from the `'use client'` boundary and tries to package Prisma for the browser.
- **`import type { ... }`** — the editor needs the runtime *values* (it iterates `KNOWN_PREDICATES` to render `<option>` elements), so a type-only import would have removed the data the component actually uses.
- **Marking `predicates.ts` as `'server-only'` via the `server-only` package** — that would have moved the failure earlier (a clearer error message in the editor file instead of a webpack trace), but it still leaves the editor unable to render the dropdown. The real fix has to make the *static* parts of the registry importable from the client.
- **Inlining the static predicate list into the editor** — would have worked but introduced a parallel source of truth. Future predicates would have to be added in two places (the registry for the runtime, the inlined copy for the UI), and the two would drift the first time someone added a predicate and forgot the editor copy.

## Solution

Split the registry into two modules along the client/server boundary:

```text
src/lib/
  predicates.catalog.ts    # NEW — pure metadata only; zero server imports
  predicates.ts            # MODIFIED — re-exports catalog + adds evaluate closures
```

**Catalog module** (`predicates.catalog.ts`) carries only static, browser-safe data: `{ key, name, description, deepLinkPath? }` per entry plus the derived `KNOWN_PREDICATE_KEYS` const. No `import { prisma }`, no `import 'server-only'`, no Node API references. This file is now importable from:

- any `'use client'` component (admin editor, future task-instance UIs)
- any Server Component (no contention; metadata is metadata)
- any Vitest unit test (no Prisma stubbing needed)
- the Zod validator that calls `KNOWN_PREDICATE_KEYS.includes(parsed.predicateKey)` — was already client-imported by the admin task POST schema

**Runtime module** (`predicates.ts`) imports the catalog, layers the `evaluate: (userId) => Promise<boolean>` closures on top, and exports the combined `KNOWN_PREDICATES` array plus `evaluatePredicate(key, userId)` and `reevaluatePendingInstancesForUser(userId)`. This file imports `prisma` and stays strictly server-side. The Prisma client never reaches a browser bundle because nothing imported by a client component touches it.

The migration is mechanical:

1. Extract the static fields and `KNOWN_PREDICATE_KEYS` into `predicates.catalog.ts`.
2. In `predicates.ts`, `import { CATALOG } from './predicates.catalog'` and build `KNOWN_PREDICATES` by zipping each catalog entry with its evaluate closure (e.g., `CATALOG.map(c => ({ ...c, evaluate: EVALUATORS[c.key] }))`).
3. Switch the validator (`src/lib/validators.ts`) and the editor (`src/components/tasks/AdminTaskEditor.tsx`) to import from `predicates.catalog` instead of `predicates`.
4. Server callers (`src/lib/notifications.ts`, action handlers, scheduler) keep importing from `predicates` and get the same `KNOWN_PREDICATES` shape they had before — no API churn.

After the split, `pnpm build` succeeds, the editor renders the dropdown identically, and the validator and the runtime evaluator continue to share a single typed source of truth for the predicate key set.

## Prevention

Three checks would have caught this earlier:

1. **Make `pnpm build` part of the per-unit verification gate.** Unit-level verification in `ce-plan` workflows tends to be `pnpm typecheck && pnpm test`. Both pass for client/server bundle leaks. Adding `pnpm build` to the gate would catch the issue the moment the offending import lands, not at the integration-pass at end of the implementation phase.
2. **Lint rule: ban `'server-only'`-implying imports from any module reachable by a `'use client'` boundary.** A custom ESLint rule that walks `import` graphs starting from every `'use client'` file and fails on any transitive `import { prisma } from '@/lib/db'` (or similar known server-only modules — `nodemailer`, `argon2`, `next-auth/jwt`, `fs`, `crypto` if not from node:crypto explicitly) would surface this at lint time. The rule is roughly the inverse of what `import 'server-only'` does — instead of marking modules as server-only and trusting authors to never import them from the client, the rule scans the actual import graph and reports violations.
3. **Catalog-first design as a convention.** When adding any new code-owned registry (`KNOWN_PREDICATES`, `KNOWN_TRIGGER_KINDS`, future enums), split the static metadata into a `*.catalog.ts` module by default — even when no client consumer exists yet. The cost is one extra file; the benefit is the boundary is in place before someone needs it, and the lint rule from #2 has a stable surface to enforce.

## Related precedents

- `src/lib/translations.ts` — the existing canonical "code-owned registry" pattern. It is already client-safe because the file imports nothing Node-only; the catalog/runtime split for predicates is the same idea applied retroactively when the runtime side grew Prisma dependencies. See [`SOL-2026-005` — DB-backed UI translation registry](../architecture-patterns/db-backed-ui-translation-registry.md).
- `src/lib/docs-solutions/catalog.ts` — the catalog stack solution explicitly designs its catalog module Prisma-free for the same reason. See [`SOL-2026-011` — Drift-tested code-owned catalog stack](../architecture-patterns/code-owned-drift-tested-catalog-stack.md).
- The Next.js [server-only](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment) and [client-only](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-client-only-code-out-of-the-server-environment) marker packages are the framework's intended escape hatches for this class of bug. Combining them with the catalog/runtime split is belt-and-braces — the markers fail the build with a clear error if anyone re-merges the modules.
