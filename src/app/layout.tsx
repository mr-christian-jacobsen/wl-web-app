import type { Metadata, Viewport } from "next";

import { AppSessionProvider } from "@/components/SessionProvider";
import { DevBranchBadge } from "@/components/DevBranchBadge";
import { ErrorReporter } from "@/components/ErrorReporter";
import { ThemeWatcher } from "@/components/ThemeWatcher";
import { TranslationsProvider } from "@/components/TranslationsProvider";
import { auth } from "@/lib/auth";
import { getShortBranch } from "@/lib/git-branch";
import { getServerTranslations } from "@/lib/translations.server";

import "./globals.css";

// Prefix the browser-tab title with the branch name in dev so multiple
// open worktrees stay distinguishable in the tab/window list. Returns
// "wl-web-app" unchanged in production (where `getShortBranch()` is
// gated to `null`).
const branchTitlePrefix = (() => {
  const short = getShortBranch();
  return short ? `[${short}] ` : "";
})();

export const metadata: Metadata = {
  title: `${branchTitlePrefix}wl-web-app`,
  description: "Responsive web app with email/password authentication",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Decide what `class` to stamp on <html> at SSR time, given the user's stored
 * preference. We can't know the OS preference on the server, so for "system"
 * we render with no class and let the inline script below pick the right one
 * before the browser paints.
 */
function htmlClassFor(preference: string | null): string {
  if (preference === "dark") return "dark";
  if (preference === "light") return "";
  return ""; // "system" / unknown — script will handle
}

/**
 * Synchronously runs in <head> before paint. For "system" mode (or no
 * preference), it adds `dark` to <html> if the OS is in dark mode. For
 * explicit modes, this script is a no-op — the server already decided.
 */
function buildThemeBootScript(preference: string | null): string {
  const explicit = preference === "light" || preference === "dark";
  if (explicit) return "";
  return `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(_){}})();`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const preference = session?.user.themePreference ?? null;
  const htmlClass = htmlClassFor(preference);
  const bootScript = buildThemeBootScript(preference);

  // Resolve the user's preferred language and load the translation
  // dict. The helper wraps both queries in React `cache`, so any
  // downstream server component that calls `getServerTranslations` or
  // `getServerT` in the same render shares the result for free.
  const translations = await getServerTranslations();

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      {/*
        suppressHydrationWarning on <body> tolerates attributes injected by
        browser extensions (ColorZilla's `cz-shortcut-listen`, Grammarly,
        MetaMask, LastPass, …) that the server can't anticipate. The flag is
        element-local: only attributes on <body> itself become tolerant —
        every child still hydrates strictly.
      */}
      <body suppressHydrationWarning>
        {bootScript && (
          // First child of <body> so it runs synchronously before any content
          // is rendered below — eliminates the flash-of-wrong-theme on hard
          // reload. Note: rendering an explicit <head> here would clobber the
          // CSS / metadata Next.js auto-injects, so the script lives in body.
          <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        )}
        <AppSessionProvider>
          <TranslationsProvider dict={translations}>
            <ThemeWatcher preference={preference} />
            <ErrorReporter />
            <DevBranchBadge />
            <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </main>
          </TranslationsProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
