---
id: SOL-2026-015
title: Register every new `/api/**` route's OpenAPI path in the same commit as the route handler
date: 2026-06-01
status: active
category: docs/solutions/conventions
module: src/lib/openapi/ (registry, routes/*, register-validators)
problem_type: convention
component: tooling
severity: medium
applies_when:
  - "Adding a new route file under `src/app/api/**/route.ts`"
  - "Splitting an existing route into smaller route files"
  - "Renaming a route's URL path or HTTP method"
  - "Adding or renaming a Zod schema in `src/lib/validators.ts` that the spec references"
tags:
  - api-documentation
  - app-router
  - drift-detection
  - nextjs-route-handler
  - openapi
  - registry
---

# Register every new `/api/**` route's OpenAPI path in the same commit as the route handler

## Context

`tests/unit/openapi-coverage.test.ts` walks `src/app/api/**/route.ts` and asserts every exported HTTP method has a matching `registry.registerPath(...)` entry in `src/lib/openapi/routes/<area>.ts`. The test fails CI **in either direction**: an undocumented route is a failure, and a documented route with no source file is a failure. This is the bidirectional drift gate that keeps the Swagger / Scalar surface at `/super-admin/api-docs` honest. The pattern is established at [SOL-2026-006](../architecture-patterns/openapi-spec-from-zod-validators.md).

When the tasks + in-app notifications feature shipped (PR #24), ten implementation units added or modified ~16 route files. The U4 subagent independently noticed that adding a route file in one commit and the matching `registerPath` block in a later commit produces a red CI build on the intermediate commit, which:

- breaks `git bisect` for any unrelated investigation crossing that range
- forces a force-push or fix-up commit to keep the branch's commit history clean
- discourages downstream contributors from rebasing across the broken commit

U4 landed both pieces in one commit. U5 through U10 copied the pattern without any of them being told to. Nothing in `ce-work`'s prompt template or `CLAUDE.md` mandates it; the convention propagated by subagents reading earlier commits in the branch and matching their shape. That's fine for one cohesive feature, but a future contributor — or a future agent invocation that doesn't first read the prior diff — has no documented norm to follow and may reasonably split the work across commits.

## Guidance

**One commit per route covers all four things at once:**

1. The route handler — `src/app/api/<area>/<route>/route.ts` (with its exported HTTP method functions)
2. The `registry.registerPath(...)` block for that route — added to or extending `src/lib/openapi/routes/<area>.ts`
3. Any new Zod schema(s) the registration references — added to `src/lib/validators.ts` AND registered via `registry.register("Name", schema)` in `src/lib/openapi/register-validators.ts`
4. Any new DTO(s) the response shape references — added to `src/lib/openapi/schemas.ts`

If the area's routes file (`src/lib/openapi/routes/<area>.ts`) doesn't exist yet, this commit creates it AND wires its `registerXxxRoutes()` export into `src/lib/openapi/spec.ts`'s `registerAll()` function. Adding a new `area` is one extra change; not a separate commit.

Tags map similarly: a new `Tag` entry in `src/lib/openapi/registry.ts`'s `TAGS` map and the corresponding `{ name, description }` entry in `spec.ts`'s `tags:` array travel together with the first route under that tag.

**The commit message names the route + method**, so `git log --oneline` makes it findable:

```
feat(<area>): U<n> add POST /api/<area>/<route> + spec registration
```

## Why This Matters

- **Bisectability stays intact.** A reviewer or a future bug hunt running `git bisect` across the feature branch hits no red commits. Same for `git log --reverse --oneline` reading.
- **The drift test serves its purpose at the smallest granularity.** Catching drift one commit later than it was introduced is much cheaper than catching it after a feature merge consolidates ten units.
- **Code-review attention stays focused.** A reviewer looking at the route file in PR diff also sees the registration; they don't have to cross-reference to confirm the spec was updated.
- **No fix-up commits, no force-pushes for cosmetic CI restoration.** The branch's history stays clean without rebase gymnastics.
- **Onboarding cost drops for the next contributor.** "Add a route" is one mental unit, not two coupled units with an enforced ordering.

The pattern is the same shape as `KNOWN_TRANSLATIONS` and `KNOWN_PREDICATES` — drift-tested code-owned registries where additions must travel with their evidence (see [SOL-2026-011](../architecture-patterns/code-owned-drift-tested-catalog-stack.md) for the generalised version).

## When to Apply

- Always, for any `git commit` that touches `src/app/api/**/route.ts` — whether adding, renaming, or removing.
- Includes route renames: the new route's `registerPath` AND the old route's removal travel together in one commit so the spec never describes a path that doesn't exist.
- Same rule for the corresponding Zod schemas in `src/lib/validators.ts` if the route reference depends on a new one.

**Skip rule:** if the change is a pure refactor inside an already-registered route's handler (e.g., extracting a helper, renaming an internal variable, fixing a bug in the response body construction) and neither the path, method, request shape, nor response shape changes, the spec doesn't need touching — no `registerPath` update required.

## Examples

### Wrong (split across commits)

```
abc1234 feat(tasks): add POST /api/super-admin/tasks/[id]/assign
def5678 chore(tasks): register assign endpoint in openapi
```

After `abc1234` lands, CI is red — `tests/unit/openapi-coverage.test.ts` fails with "POST /api/super-admin/tasks/[id]/assign exported but not documented". `git bisect` can't cross this commit cleanly.

### Right (single commit)

```
abc1234 feat(tasks): U4 add POST /api/super-admin/tasks/[id]/assign + spec registration
```

The commit's diff:

- `src/app/api/super-admin/tasks/[id]/assign/route.ts` (new)
- `src/lib/openapi/routes/admin-tasks.ts` (extended — new `registry.registerPath({...})` block)
- `src/lib/validators.ts` (new `assignTaskInstanceSchema`)
- `src/lib/openapi/register-validators.ts` (new `registry.register("AssignTaskInstanceInput", assignTaskInstanceSchema)`)
- (no schemas.ts change because the response reuses the existing `TaskInstanceDTO`)

CI green at every commit; `git log --oneline` reads cleanly; reviewer sees the full surface change in one diff.

### Right (new area — extends the cost slightly but still one commit)

```
abc1234 feat(notifications): add Notifications tag + GET/POST /api/notifications + spec registration
```

Diff includes everything from the previous example plus:

- `src/lib/openapi/routes/notifications.ts` (new file)
- `src/lib/openapi/spec.ts` (import + `registerNotificationRoutes()` call in `registerAll()`; new entry in `tags:` array)
- `src/lib/openapi/registry.ts` (new `Notifications` entry in `TAGS` map)

One commit, one mental unit, CI stays green.

## Related

- [SOL-2026-006](../architecture-patterns/openapi-spec-from-zod-validators.md) — the OpenAPI registry contract itself. The convention in this doc is what keeps that contract auditable at every commit.
- [SOL-2026-011](../architecture-patterns/code-owned-drift-tested-catalog-stack.md) — the broader "code-owned drift-tested catalog stack" pattern. The OpenAPI spec is one instance; `KNOWN_TRANSLATIONS` and `KNOWN_PREDICATES` are others. The same one-commit-with-evidence rule applies to all of them.
- `tests/unit/openapi-coverage.test.ts` — the test that turns this from a soft norm into a hard CI gate.
- PR #24 — the tasks + in-app notifications feature whose ten implementation units propagated this discipline organically. Worth a `git log --oneline` skim of that PR's branch to see the shape in practice.
