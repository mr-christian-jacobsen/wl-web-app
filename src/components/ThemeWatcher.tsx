"use client";

import { useEffect } from "react";

/**
 * Keep the `<html class="dark">` flag in sync with the OS prefers-color-scheme
 * media query while the user's stored preference is "system" (or not set).
 * For explicit "light"/"dark", does nothing — the layout already stamped the
 * class server-side.
 */
export function ThemeWatcher({ preference }: { preference: string | null }) {
  useEffect(() => {
    const isSystem = preference === null || preference === "system";
    if (!isSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [preference]);

  return null;
}
