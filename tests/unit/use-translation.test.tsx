import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TranslationsProvider,
  useTranslation,
} from "@/components/TranslationsProvider";

/**
 * Regression test for SOL-2026-014 — the `useTranslation()` hook must
 * return a stable `t` function reference across re-renders when the
 * underlying `dict` reference is unchanged. Pre-fix, the hook returned a
 * fresh `{ dict, t }` object literal on every call, which made `t` a new
 * reference each render. Any consumer that included `t` in a useCallback
 * or useEffect dep array (notably `NotificationBell`) entered an
 * infinite render loop manifesting as visible flicker + "Maximum update
 * depth exceeded" in the browser console.
 *
 * The fix wrapped the hook's return in `useMemo([dict])` and hoisted the
 * empty-dict fallback to a module-level singleton. These tests catch any
 * future regression of either piece — if someone removes the `useMemo`,
 * the stable-`t` test fails; if someone re-introduces a fresh `{}`
 * literal in the nullish-coalescing fallback, the empty-dict-stability
 * test fails.
 *
 * Doubles as the first `.test.tsx` test in the codebase — establishes the
 * React Testing Library convention documented in CLAUDE.md.
 */

const STABLE_DICT = { greeting: "Hello" };

describe("useTranslation", () => {
  it("returns a stable `t` reference across re-renders when dict is unchanged", () => {
    const observed: Array<{ t: unknown }> = [];

    function Probe({ tick }: { tick: number }) {
      const { t } = useTranslation();
      observed.push({ t });
      return <span data-testid="probe">{String(tick)}</span>;
    }

    const { rerender } = render(
      <TranslationsProvider dict={STABLE_DICT}>
        <Probe tick={0} />
      </TranslationsProvider>,
    );

    rerender(
      <TranslationsProvider dict={STABLE_DICT}>
        <Probe tick={1} />
      </TranslationsProvider>,
    );

    rerender(
      <TranslationsProvider dict={STABLE_DICT}>
        <Probe tick={2} />
      </TranslationsProvider>,
    );

    // Three rerenders → at least three observations; with React Strict Mode
    // in development mode, mount-effects may run twice, but we don't care
    // about exact count — we care that every observed `t` is the same ref.
    expect(observed.length).toBeGreaterThanOrEqual(3);

    const firstT = observed[0]!.t;
    for (const o of observed) {
      expect(o.t).toBe(firstT);
    }
  });

  it("returns a stable `t` reference when no provider is mounted (fallback path)", () => {
    // No <TranslationsProvider> wrapping — exercises the
    // `useContext(...) ?? EMPTY_DICT` branch. Pre-fix, that branch
    // synthesised a fresh `{}` literal on every call, breaking the memo
    // cache. The EMPTY_DICT module-level singleton makes this branch
    // stable.
    const observed: Array<{ t: unknown }> = [];

    function Probe({ tick }: { tick: number }) {
      const { t } = useTranslation();
      observed.push({ t });
      return <span data-testid="probe-no-provider">{String(tick)}</span>;
    }

    const { rerender } = render(<Probe tick={0} />);
    rerender(<Probe tick={1} />);
    rerender(<Probe tick={2} />);

    expect(observed.length).toBeGreaterThanOrEqual(3);

    const firstT = observed[0]!.t;
    for (const o of observed) {
      expect(o.t).toBe(firstT);
    }
  });

  it("returns a new `t` reference when dict identity changes", () => {
    // Sanity-check the negative case — when `dict` legitimately changes
    // (e.g., on language switch), the memo must invalidate and a new
    // `t` must be produced. Otherwise translations would be stuck on the
    // first-mounted language for the lifetime of the consumer.
    const observed: Array<{ t: unknown }> = [];

    function Probe() {
      const { t } = useTranslation();
      observed.push({ t });
      return null;
    }

    const dictA = { greeting: "Hello" };
    const dictB = { greeting: "Hej" };

    const { rerender } = render(
      <TranslationsProvider dict={dictA}>
        <Probe />
      </TranslationsProvider>,
    );

    rerender(
      <TranslationsProvider dict={dictB}>
        <Probe />
      </TranslationsProvider>,
    );

    expect(observed.length).toBeGreaterThanOrEqual(2);
    expect(observed[0]!.t).not.toBe(observed[observed.length - 1]!.t);
  });
});
