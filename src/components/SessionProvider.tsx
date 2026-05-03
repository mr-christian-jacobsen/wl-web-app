"use client";

import { SessionProvider } from "next-auth/react";

import { UsageTracker } from "@/components/UsageTracker";

export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <UsageTracker />
      {children}
    </SessionProvider>
  );
}
