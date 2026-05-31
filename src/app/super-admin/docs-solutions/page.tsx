import { DocsSolutionsList } from "@/components/super-admin/DocsSolutionsList";
import { KNOWN_PROBLEM_TYPES, KNOWN_TAGS } from "@/lib/docs-solutions/catalog";
import { buildSourceUrl, scanDocs } from "@/lib/docs-solutions/load.server";
import type { SolutionDoc } from "@/lib/docs-solutions/types";
import { getServerT } from "@/lib/translations.server";

/**
 * /super-admin/docs-solutions — read-only browse over docs/solutions/.
 *
 * Auth is handled by `src/app/super-admin/layout.tsx`'s defence-in-depth
 * guard (edge middleware + layout `auth()` check). Per CLAUDE.md's
 * "Routing: `/super-admin/*`" section, this page intentionally does NOT
 * re-call `requireSuperAdmin()` — that helper is for `/api/super-admin/**`
 * route handlers, where the layout guard cannot reach.
 */
export default async function DocsSolutionsPage() {
  const t = await getServerT();

  const docs = scanDocs();

  // Pre-compute source URLs server-side so the client bundle never sees
  // the GITHUB_REPO_URL env var name or value.
  const rows: SolutionRow[] = docs.map((doc) => ({
    path: doc.path,
    id: doc.id ?? null,
    title: doc.title ?? null,
    category: pickCategory(doc),
    problemType: doc.problemType ?? null,
    status: doc.status ?? null,
    tags: doc.tags ?? [],
    date: pickDate(doc),
    sourceUrl: buildSourceUrl(doc.path),
    supersedes: pickStringArray(doc.frontmatter?.supersedes),
    supersededBy:
      typeof doc.frontmatter?.superseded_by === "string"
        ? doc.frontmatter.superseded_by
        : null,
  }));

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("super_admin.docs_solutions.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.docs_solutions.description")}
        </p>
      </div>
      <DocsSolutionsList
        initial={rows}
        problemTypes={[...KNOWN_PROBLEM_TYPES]}
        tags={[...KNOWN_TAGS]}
      />
    </section>
  );
}

// ─── Shared row shape for the client component ────────────────────────────
//
// Keep this type alongside the page (not in types.ts) — it carries the
// server-side projection of `SolutionDoc` for the browse table only.

export type SolutionRow = {
  path: string;
  id: string | null;
  title: string | null;
  category: string | null;
  problemType: string | null;
  status: string | null;
  tags: string[];
  date: string | null;
  sourceUrl: string | null;
  supersedes: string[];
  supersededBy: string | null;
};

function pickCategory(doc: SolutionDoc): string | null {
  const cat = doc.frontmatter?.category;
  return typeof cat === "string" ? cat : null;
}

function pickDate(doc: SolutionDoc): string | null {
  // yaml.parse may yield a Date object when the value isn't quoted; the
  // frontmatter type declares the field as string for the common case,
  // so widen here before checking.
  const raw: unknown = doc.frontmatter?.date;
  if (typeof raw === "string") return raw;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return null;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
