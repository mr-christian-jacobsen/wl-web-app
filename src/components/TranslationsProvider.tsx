"use client";

import { createContext, useContext, useMemo } from "react";

import { translate, type TranslateParams, type TranslationDict } from "@/lib/translations";

/**
 * Carries the resolved translation dictionary for the current request
 * down the React tree. Root `RootLayout` (server component) loads the
 * dict via `getTranslations(session.user.languageId)` and renders
 * `<TranslationsProvider dict={...}>...</TranslationsProvider>` so any
 * client component below can call `useTranslation()` synchronously.
 */
const TranslationsContext = createContext<TranslationDict | null>(null);

export function TranslationsProvider({
  dict,
  children,
}: {
  dict: TranslationDict;
  children: React.ReactNode;
}) {
  // Memoise so consumers that depend on dict identity (rare, but useful
  // for derived caches) don't re-render every parent re-render.
  const value = useMemo(() => dict, [dict]);
  return <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>;
}

/**
 * Hook returning a stable `t(key)` function plus the raw dict.
 *
 * The function falls back through:
 *   dict value → registry default → key string
 * (see `translate` in `src/lib/translations.ts`), so calling `t` with a
 * registered key always renders the user-visible default until an admin
 * provides a translation, and calling with an unregistered key renders
 * the key itself — making typos loud in QA.
 */
export function useTranslation(): {
  t: (key: string, params?: TranslateParams) => string;
  dict: TranslationDict;
} {
  const dict = useContext(TranslationsContext) ?? {};
  return {
    dict,
    t: (key: string, params?: TranslateParams) => translate(dict, key, params),
  };
}
