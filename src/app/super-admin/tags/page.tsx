import { TagsCatalog } from "@/components/super-admin/TagsCatalog";
import { listCategoriesWithCount } from "@/lib/categories";
import { listTagsPage } from "@/lib/tags";
import { parseTagsPageSearchParams } from "@/lib/tags-page-url";
import { getServerT } from "@/lib/translations.server";

/**
 * `/super-admin/tags` — the tag catalog. Server component: parses
 * `searchParams` via the shared `parseTagsPageSearchParams` helper
 * (which falls back to defaults on a bad URL rather than 400-ing the
 * page) and fetches the categories + paginated tag list in parallel.
 *
 * The client component below owns URL writes — when the user changes
 * the search, sort, page, or scope, it pushes a new URL and calls
 * `router.refresh()`, which re-runs this server function with the
 * updated params.
 */
export default async function SuperAdminTagsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getServerT();
  const rawParams = await props.searchParams;
  const query = parseTagsPageSearchParams(rawParams);

  const [categoryRows, tagPage] = await Promise.all([
    listCategoriesWithCount(),
    listTagsPage(query),
  ]);

  const initialCategories = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    createdAt: c.createdAt.toISOString(),
    tagCount: c._count.assignments,
  }));

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("super_admin.tags.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.tags.description")}
        </p>
      </div>
      <TagsCatalog
        initialCategories={initialCategories}
        initialTagPage={tagPage}
        initialQuery={query}
      />
    </section>
  );
}
