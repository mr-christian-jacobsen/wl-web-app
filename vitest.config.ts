import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Default environment is `node` — the existing 320+ tests under
    // `tests/unit/**/*.test.ts` exercise pure-function modules (validators,
    // OpenAPI registry, Prisma normaliser, predicate evaluator, etc.) and
    // benefit from the lighter `node` runtime.
    //
    // Component / hook tests live in `.test.tsx` files and need a DOM —
    // `environmentMatchGlobs` swaps to `jsdom` for those files only, so we
    // don't pay the jsdom startup cost across the whole suite.
    environment: "node",
    environmentMatchGlobs: [["tests/unit/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
