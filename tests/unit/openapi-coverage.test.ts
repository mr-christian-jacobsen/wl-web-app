import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getOpenApiDocument } from "@/lib/openapi/spec";

/**
 * Walks `src/app/api/**\/route.ts` and asserts every (method, URL) pair
 * implemented in code has a matching `registry.registerPath` entry in
 * `src/lib/openapi/routes/*`. Catches the failure mode where a new endpoint
 * lands without an OpenAPI registration, which would silently make the
 * Swagger docs stale.
 *
 * Excludes:
 *   - `/api/auth/[...nextauth]` — NextAuth-internal, not a stable contract
 *   - `/api/openapi.json` — the docs endpoint itself
 */

const API_ROOT = path.resolve(__dirname, "../../src/app/api");

const EXCLUDED_DIRS = new Set([
  // NextAuth's catch-all router is not part of the documented contract.
  "[...nextauth]",
]);
const EXCLUDED_PATHS = new Set(["/api/openapi"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name === "route.ts") {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Convert a filesystem path under `src/app/api` to an OpenAPI-style URL:
 *   src/app/api/super-admin/users/[id]/route.ts → /api/super-admin/users/{id}
 *   src/app/api/surveys/[slug]/responses/route.ts → /api/surveys/{slug}/responses
 */
function routeFileToUrl(filePath: string): string {
  const rel = path.relative(path.resolve(API_ROOT, ".."), filePath);
  const withoutRoute = rel.replace(/[\\/]route\.ts$/, "");
  // Normalise Windows backslashes and convert Next.js `[param]` to `{param}`.
  const segments = withoutRoute.split(/[\\/]/);
  const url = "/" + segments.map((seg) => seg.replace(/^\[(.+)\]$/, "{$1}")).join("/");
  return url;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function exportedMethods(filePath: string): string[] {
  const src = fs.readFileSync(filePath, "utf8");
  return HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(src),
  ).map((m) => m.toLowerCase());
}

describe("OpenAPI coverage", () => {
  it("documents every (method, path) pair exported under /api", () => {
    const doc = getOpenApiDocument();
    const documented = new Set<string>();
    for (const [pathKey, ops] of Object.entries(doc.paths ?? {})) {
      for (const method of Object.keys(ops as Record<string, unknown>)) {
        documented.add(`${method.toLowerCase()} ${pathKey}`);
      }
    }

    const files = walk(API_ROOT);
    const missing: string[] = [];
    for (const file of files) {
      const url = routeFileToUrl(file);
      if (EXCLUDED_PATHS.has(url)) continue;
      for (const method of exportedMethods(file)) {
        const key = `${method} ${url}`;
        if (!documented.has(key)) missing.push(key);
      }
    }

    expect(missing, `Missing OpenAPI registrations:\n${missing.join("\n")}`).toEqual([]);
  });

  it("only documents real (method, path) pairs", () => {
    const doc = getOpenApiDocument();
    const files = walk(API_ROOT);
    const implemented = new Set<string>();
    for (const file of files) {
      const url = routeFileToUrl(file);
      for (const method of exportedMethods(file)) {
        implemented.add(`${method} ${url}`);
      }
    }

    const orphan: string[] = [];
    for (const [pathKey, ops] of Object.entries(doc.paths ?? {})) {
      if (EXCLUDED_PATHS.has(pathKey)) continue;
      for (const method of Object.keys(ops as Record<string, unknown>)) {
        const key = `${method.toLowerCase()} ${pathKey}`;
        if (!implemented.has(key)) orphan.push(key);
      }
    }

    expect(orphan, `Documented endpoints with no implementation:\n${orphan.join("\n")}`).toEqual([]);
  });
});
