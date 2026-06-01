// Vitest setup file — runs once per test file before the test code.
//
// Currently only extends Vitest's `expect` with the DOM matchers from
// `@testing-library/jest-dom` (so `.test.tsx` tests can use matchers like
// `toBeInTheDocument`, `toHaveAttribute`, `toHaveTextContent`). The matchers
// are no-ops in the `node` environment used by `.test.ts` files, so this
// import is safe to apply globally even though only component / hook tests
// rely on it.

import "@testing-library/jest-dom/vitest";
