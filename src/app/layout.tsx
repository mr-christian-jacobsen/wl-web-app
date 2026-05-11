import type { Metadata, Viewport } from "next";

import { AppSessionProvider } from "@/components/SessionProvider";
import { ErrorReporter } from "@/components/ErrorReporter";
import { ThemeWatcher } from "@/components/ThemeWatcher";
import { auth } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "wl-web-app",
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

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <body>
        {bootScript && (
          // First child of <body> so it runs synchronously before any content
          // is rendered below — eliminates the flash-of-wrong-theme on hard
          // reload. Note: rendering an explicit <head> here would clobber the
          // CSS / metadata Next.js auto-injects, so the script lives in body.
          <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        )}
        <AppSessionProvider>
          <ThemeWatcher preference={preference} />
          <ErrorReporter />
          <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </AppSessionProvider>
      </body>
    </html>
  );
}
