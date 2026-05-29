---
title: Per-user theme with server-side class stamping (no flash of wrong theme)
date: 2026-05-29
category: docs/solutions/architecture-patterns
module: Theming / root layout
problem_type: architecture_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - "Building a Light / Dark / System theme switch that must persist per user across devices"
  - "Theme must apply before first paint with zero flash-of-wrong-theme on hard reload"
  - "Using Next.js App Router with a server-rendered root layout and Auth.js (NextAuth v5) JWT sessions"
  - "Tailwind dark mode is configured with darkMode: 'class'"
tags:
  - theme
  - dark-mode
  - nextauth
  - app-router
  - flash-of-unstyled-content
  - prisma
  - tailwind
---

# Per-user theme with server-side class stamping (no flash of wrong theme)

## Context

A three-mode theme switch (Light / Dark / System) has two hard requirements that
pull in different directions:

1. **Persist per user, across devices.** A localStorage-only theme is per-device
   and is invisible to the server, so the first server-rendered HTML can't reflect
   it. That guarantees a flash on every fresh navigation.
2. **Apply before first paint, every time.** Any approach that resolves the theme
   in a `useEffect` (after hydration) repaints the page once React mounts — the
   classic flash-of-wrong-theme (FOWT) on hard reload.

The resolution is to make the preference a first-class server-side fact (a DB
column threaded through the session) and to decide the `<html>` class at SSR
time, falling back to a tiny synchronous inline script only for the one case the
server genuinely cannot know: the OS preference behind `System` mode.

## Guidance

Treat the theme preference as three states and store it as a **nullable** column,
where `null` means `System`:

- DB: `User.themePreference String?` in `prisma/schema.prisma` — values `"light"`,
  `"dark"`, or `null` (System).
- Auth: thread `themePreference` through both the **jwt** and **session**
  callbacks in `src/auth.config.ts` so it is available server-side on every
  request without an extra query. Handle the `update` trigger too, so a change
  made on `/profile` propagates into the live session without forcing a re-login.
- Layout: in the server component `src/app/layout.tsx`, read
  `session.user.themePreference` and decide the class:
  - explicit `"dark"` → render `<html class="dark">`,
  - explicit `"light"` → render `<html>` with no theme class,
  - `null` / System → render no class server-side and emit a small inline boot
    script that resolves `prefers-color-scheme` and stamps `dark` before paint.
- Tailwind: `darkMode: 'class'` so the `dark` class on `<html>` is the single
  source of truth for styling.

### Key pitfall: the inline script must be the first child of `<body>`, not in `<head>`

For System mode the server can't know the OS preference, so a synchronous script
must run before paint. The instinct is to put it in `<head>`, but in the App
Router **rendering your own `<head>` (or head-level script) clobbers the CSS and
metadata Next.js auto-injects.** Instead, render the script as the **first child
of `<body>`** — it still runs synchronously before any visible content below it,
which is enough to eliminate the flash, while leaving Next's head injection intact.

```tsx
// src/app/layout.tsx (sketch — see the real file for the exact helpers)
const preference = session?.user.themePreference ?? null;     // null = System
const htmlClass = preference === "dark" ? "dark" : "";          // explicit → SSR class
const bootScript =
  preference === "light" || preference === "dark"
    ? ""                                                        // explicit → no script
    : `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){` +
      `document.documentElement.classList.add('dark')}}catch(_){}})();`;

return (
  <html lang="en" className={htmlClass} suppressHydrationWarning>
    <body suppressHydrationWarning>
      {bootScript && <script dangerouslySetInnerHTML={{ __html: bootScript }} />}
      {/* ...providers + content... */}
    </body>
  </html>
);
```

### suppressHydrationWarning on `<html>`

For System mode the server emits no class but the boot script may add `dark`
before React hydrates, so the server and client `<html>` markup differ. Set
`suppressHydrationWarning` on `<html>` to silence the (expected) mismatch warning.
The flag is element-local — only the `<html>` attributes become tolerant; every
child still hydrates strictly.

## Why This Matters

- **No flash, ever.** Explicit Light/Dark is decided in SSR HTML, so the very
  first byte is already correct. System mode is corrected by a blocking script
  that runs before paint. Neither path waits for React.
- **Persists across devices.** Because the preference is a DB column carried in
  the session JWT, a user who sets Dark on their laptop sees Dark on their phone —
  no per-device localStorage shimming.
- **No extra round-trips.** Reading the value off the already-decoded session
  costs nothing at request time; there is no separate fetch and no client effect
  gating the first render.
- **Respects the OS for System.** `null` defers to `prefers-color-scheme` live,
  so changing the OS theme is reflected without touching the account.

## When to Apply

- A theme (or any per-user pre-paint visual fact) must survive across devices and
  be authoritative server-side.
- You are on Next.js App Router and want SSR HTML to already carry the correct
  theme class.
- You have a true "System / follow OS" mode the server cannot resolve and need a
  minimal synchronous client shim for just that case.
- Skip the full pattern if a per-device, post-hydration theme is acceptable — a
  cookie or localStorage toggle is simpler when cross-device persistence and
  zero-flash are not requirements.

## Examples

Decision matrix the layout implements:

| Stored `themePreference` | SSR `<html>` class | Inline boot script |
|--------------------------|--------------------|--------------------|
| `"dark"`                 | `dark`             | none (server already decided) |
| `"light"`                | (none)             | none (server already decided) |
| `null` (System)          | (none)             | resolves `prefers-color-scheme`, adds `dark` if OS is dark |

Anti-pattern that reintroduces the flash:

```tsx
// DON'T: resolves after hydration → flash-of-wrong-theme on every hard reload
useEffect(() => {
  const pref = localStorage.getItem("theme");
  document.documentElement.classList.toggle("dark", pref === "dark");
}, []);
```

Anti-pattern that breaks Next.js head injection:

```tsx
// DON'T: a head-level script clobbers Next's auto-injected CSS/metadata.
// Put the boot script as the first child of <body> instead.
<head>
  <script dangerouslySetInnerHTML={{ __html: bootScript }} />
</head>
```

## Related

- `src/app/layout.tsx` — server-side class decision + the System-mode boot script as the first child of `<body>`.
- `src/auth.config.ts` — `themePreference` threaded through the jwt + session callbacks (including the `update` trigger).
- `prisma/schema.prisma` — `User.themePreference String?` (nullable; `null` = System).
- `src/components/profile/ThemeToggle.tsx`, `src/app/api/profile/theme/route.ts` — where the preference is changed and persisted.
- CLAUDE.md — defence-in-depth and session-callback conventions for `/super-admin` and the session JWT shape.
