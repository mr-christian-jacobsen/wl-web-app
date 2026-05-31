import { listTagsQuerySchema, type ListTagsQuery } from "@/lib/validators";

/**
 * URL-state helpers for `/super-admin/tags`.
 *
 * The catalog page treats the URL as the source of truth — the server
 * component parses `searchParams` via `parseTagsPageSearchParams` and
 * fetches; the client component pushes URL updates via
 * `buildTagsPageHref` and calls `router.refresh()` to re-run the
 * fetch. Keeping these as pure functions (no Next.js imports) makes
 * them trivially unit-testable and re-usable from any context.
 *
 * Default values are intentionally omitted from generated URLs — so
 * the canonical "all defaults" link is just `/super-admin/tags`, not
 * `?page=1&pageSize=25&sort=name&order=asc&q=&scope=all`.
 */

const TAGS_PAGE_PATH = "/super-admin/tags";

/// Field defaults — kept in sync with `listTagsQuerySchema`. When a
/// parsed query field matches the default we omit it from the URL.
const DEFAULTS = {
  page: 1,
  pageSize: 25,
  sort: "name" as const,
  order: "asc" as const,
  q: "",
  scope: "all" as const,
};

/// Shape Next.js hands a server page in `searchParams` — repeat values
/// arrive as arrays, single values as strings, absent values as
/// undefined. The Zod schema only handles flat string/number coercion,
/// so we flatten arrays here (taking the first value) before parsing.
type RawSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function rawToFlatObject(
  searchParams: RawSearchParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (searchParams instanceof URLSearchParams) {
    for (const [k, v] of searchParams.entries()) {
      // URLSearchParams.entries() yields duplicates in order; keep the
      // first occurrence to match the "flatten to single value" rule.
      if (!(k in out)) out[k] = v;
    }
    return out;
  }
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? (v[0] ?? "") : v;
  }
  return out;
}

/**
 * Parse a `searchParams` object (either a `URLSearchParams` instance
 * or the Next.js plain-object shape) into a fully-defaulted
 * `ListTagsQuery`. Falls back to defaults on parse failure so a bad
 * URL never crashes the page — the user sees the unfiltered catalog
 * instead.
 */
export function parseTagsPageSearchParams(
  searchParams: RawSearchParams,
): ListTagsQuery {
  const flat = rawToFlatObject(searchParams);
  const parsed = listTagsQuerySchema.safeParse(flat);
  if (parsed.success) return parsed.data;
  // Defensive: parse an empty object to get the schema's own defaults
  // back, so this helper is the single source of "what does an
  // unspecified query look like".
  return listTagsQuerySchema.parse({});
}

/**
 * Build a `/super-admin/tags?…` href from a (possibly partial) query.
 * Fields that match the schema default are omitted to keep URLs clean
 * and shareable. Field order in the output follows the underlying
 * `URLSearchParams.set` insertion order, which is stable across runs.
 *
 * `scope === "uncategorized"` and `categoryId` are mutually exclusive
 * per the validator; this helper trusts its caller and emits whatever
 * is passed in (the validator will reject the bad combination on the
 * way back in via `parseTagsPageSearchParams`).
 */
export function buildTagsPageHref(query: Partial<ListTagsQuery>): string {
  const params = new URLSearchParams();

  if (query.q !== undefined && query.q !== DEFAULTS.q) {
    params.set("q", query.q);
  }
  if (query.sort !== undefined && query.sort !== DEFAULTS.sort) {
    params.set("sort", query.sort);
  }
  if (query.order !== undefined && query.order !== DEFAULTS.order) {
    params.set("order", query.order);
  }
  if (query.scope !== undefined && query.scope !== DEFAULTS.scope) {
    params.set("scope", query.scope);
  }
  if (query.categoryId !== undefined) {
    params.set("categoryId", query.categoryId);
  }
  if (query.page !== undefined && query.page !== DEFAULTS.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize !== undefined && query.pageSize !== DEFAULTS.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }

  const qs = params.toString();
  return qs.length === 0 ? TAGS_PAGE_PATH : `${TAGS_PAGE_PATH}?${qs}`;
}
