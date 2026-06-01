---
id: SOL-2026-014
title: Custom hook returning a fresh `{ ... }` literal causes a render loop in consumers using its functions in dep arrays
date: 2026-06-01
status: active
category: docs/solutions/runtime-errors
module: src/components/TranslationsProvider.tsx (useTranslation)
problem_type: runtime_error
component: tooling
symptoms:
  - "`NotificationBell` dropdown panel flickered visibly when open"
  - "Browser console: `Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.`"
  - "Dev server log flooded with `GET /api/notifications` + `POST /api/notifications/mark-read` every ~30 ms instead of the intended 30-second polling cadence"
  - "React stack trace pointed at `NotificationBell.useCallback[fetchNotifications]` → `NotificationBell.useEffect` → `dispatchSetState`"
  - "`pnpm typecheck`, `pnpm test`, and `pnpm build` all stayed green — the bug was invisible to every static check"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags:
  - app-router
  - nextjs
  - react-hooks
  - render-loop
  - translations
  - use-memo
---

# Custom hook returning a fresh `{ ... }` literal causes a render loop in consumers using its functions in dep arrays

## Problem

`src/components/TranslationsProvider.tsx`'s `useTranslation()` hook returned a fresh `{ dict, t }` object literal on every call. Even though the underlying `dict` was already memoised in the provider and the actual translate logic was pure, the OUTER object — and therefore the `t` function inside it — was a new reference on every render.

`NotificationBell` consumed `t` and used it in `useCallback` dependency arrays:

```ts
const fetchNotifications = useCallback(async () => {
  // ... fetch /api/notifications, setState
  setError(t("notifications.fetch_failed"));
  // ...
}, [t]); // ← t was a new reference every render
```

The bell's open-effect then declared `[open, fetchNotifications, markAllRead]` as its dependencies. Every render produced a new `t` → new `fetchNotifications` → effect deps changed → effect re-ran → fetch + mark-read + setState → render → new `t` → loop.

The JSDoc on `useTranslation` already claimed it returned "a stable `t(key)` function", but the implementation did not match the doc. Nothing in the type system or the test suite enforced that contract.

## Symptoms

- The notification bell dropdown's box flickered visibly while open — fast enough that the user reported it as "blinking".
- React's `Maximum update depth exceeded` warning fired in the browser console, with a long stack trace ending at `NotificationBell.useEffect`.
- The dev server's request log showed `GET /api/notifications 200 in ~20ms` and `POST /api/notifications/mark-read 200 in ~25ms` cycling continuously while the dropdown was open. Intended cadence was every 30s; actual cadence was every ~30ms.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` were all clean — the loop was a runtime-only failure in a hot path (dropdown open) and unit tests for the bell component were not part of the test convention.
- The component's JSDoc claimed stable behaviour that the runtime did not deliver.

## What Didn't Work

- **Disabling the polling interval in `NotificationBell`** — fixing the bell alone would have left every other consumer of `useTranslation` vulnerable to the same render-loop the moment they included `t` in a dep array. Doing it once in the provider fixes the whole codebase.
- **Inlining the `t()` error message as a hardcoded string in `fetchNotifications`** — removes one dep but doesn't fix the contract. Any future call site that uses `t` in deps would loop again. Trading a one-line fix for a recurring footgun.
- **`useRef(t)` + ref-assignment effect inside `NotificationBell`** — works but spreads boilerplate to every consumer. The hook's *whole job* is to expose a stable `t`; the consumer shouldn't have to compensate for the hook's instability.
- **Disabling the `react-hooks/exhaustive-deps` ESLint rule for that effect** — silences the symptom (effect no longer re-runs because `t` is removed from deps) but creates a stale-closure risk if `dict` ever does change. Wrong fix at the wrong layer.

## Solution

Memoise the returned object on the stable `dict` reference. Two-line change:

```ts
// src/components/TranslationsProvider.tsx
const EMPTY_DICT: TranslationDict = {};

export function useTranslation() {
  const dict = useContext(TranslationsContext) ?? EMPTY_DICT;
  return useMemo(
    () => ({
      dict,
      t: (key: string, params?: TranslateParams) => translate(dict, key, params),
    }),
    [dict],
  );
}
```

Two pieces matter here:

1. **`useMemo([dict])`** — when `dict` is stable (it is — the provider already wraps it in its own `useMemo`), the returned `{ dict, t }` object keeps its identity across renders, so `t` does too. Callbacks that depend on `t` now have a stable dep ref and the bell's open-effect only re-runs when `open` actually changes.

2. **`EMPTY_DICT` module-level singleton** — without it, `useContext(...) ?? {}` would synthesise a fresh empty object on every call when no provider is mounted. That fresh `{}` would become a new `[dict]` cache key and invalidate the memo, recreating the bug for tree positions outside the provider (HMR re-mounts, future test harness, devtools panels). Hoisting the fallback to module scope ensures the empty-context branch returns the same reference every time.

The fix is in the **hook author's** layer because consumers shouldn't have to know to compensate. Documented in JSDoc claims about stability — those claims now match the runtime.

## Why This Works

React identifies whether a `useCallback`/`useEffect` should re-run by comparing dependency-array entries with `Object.is`. Function references are objects; two functions defined by the same source produce `Object.is(fn1, fn2) === false` because they're separate objects in memory.

`useMemo([dict])` only recomputes its closure when `Object.is(prev, next) === false` for the deps. When `dict` is a stable reference (memoised in the provider), the memo cache hits and returns the same `{ dict, t }` object — so `t` keeps its identity. Consumers' `useCallback([t])` becomes effectively a stable cache too, and the consumer's `useEffect([..., callback])` only re-runs when the *other* deps change.

The provider already memoised `dict` (`useMemo(() => dict, [dict])` on line 25 of the file), which is what made the consumer-side memoisation cheap to add — no upstream changes needed, just one extra layer of memo at the hook level.

## Prevention

- **Memoise any custom-hook return that includes function references.** Every custom hook that returns `{ ...stateLike, fn1, fn2 }` should wrap the return in `useMemo`. If the underlying state is stable, the consumer can use the returned functions in dep arrays without thinking about identity. If the underlying state is not stable, the consumer learns about it through real dep changes, not phantom ones.
- **Treat JSDoc "stability" claims as contracts.** When a hook's docstring says "returns a stable function", the implementation must back that up with `useCallback` / `useMemo`. A drifted docstring is worse than no docstring because it suppresses the consumer's instinct to defend against instability.
- **Module-level singletons for fallback values** in nullish-coalescing branches that feed dep arrays (`useContext(...) ?? FALLBACK` where `FALLBACK` is referenced more than once). A fresh `{}` literal in this position silently breaks downstream memos. The same pattern applies to `?? []` for array fallbacks.
- **When a dropdown / popover / dialog uses fetch-on-open + polling**, the surface area is exactly the shape that catches this bug. Component review for new such surfaces should include "are all callback refs in the open-effect dep array genuinely stable?".

A test that would have caught this earlier: render `useTranslation` twice and assert `result1.t === result2.t`. The codebase has no React-Testing-Library convention yet (no `@testing-library/react` in `devDependencies`), so adding such a test would be precedent-setting; flagged here rather than added inline.

## Related Issues

- [`SOL-2026-012`](./client-component-pulls-prisma-into-browser-bundle.md) — same feature (tasks + notifications, PR #24). That one is about modules; this one is about identity. Both are runtime-only failures invisible to typecheck.
- [`SOL-2026-013`](../architecture-patterns/hybrid-lazy-eval-admin-tick-scheduler.md) — the scheduler this notification bell talks to.
- [PR #43](https://github.com/mr-christian-jacobsen/wl-web-app/pull/43) — the fix landing.
- [PR #24](https://github.com/mr-christian-jacobsen/wl-web-app/pull/24) — the feature where the bell was introduced. The bell's dep-array shape exposed an instability that `useTranslation` had carried since before the tasks feature; the bell was just the first consumer that polled + used `t` in deps simultaneously.
