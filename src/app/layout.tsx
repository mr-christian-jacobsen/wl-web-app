import type { Metadata, Viewport } from "next";

import { AppSessionProvider } from "@/components/SessionProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "wl-web-app",
  description: "Responsive web app with email/password authentication",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppSessionProvider>
          <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </AppSessionProvider>
      </body>
    </html>
  );
}
