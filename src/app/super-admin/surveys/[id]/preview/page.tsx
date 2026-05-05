import Link from "next/link";
import { notFound } from "next/navigation";

import { SurveyForm } from "@/components/surveys/SurveyForm";
import { prisma } from "@/lib/db";

/**
 * Admin-only dry-run of a survey form. Identical to `/s/[id]` except it
 * renders even when the survey isn't published, and the form's submit
 * is a no-op (no rows written). Auth is enforced by the parent
 * `/super-admin` layout — see CLAUDE.md.
 */
export default async function SurveyPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const survey = await prisma.survey.findUnique({
    where: { id },
    select: {
      id: true,
      publicSlug: true,
      name: true,
      description: true,
      published: true,
      steps: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          type: true,
          title: true,
          notes: true,
          options: true,
        },
      },
    },
  });
  if (!survey) notFound();

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/super-admin/surveys/${survey.id}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← Back to editor
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Preview {survey.published ? "(live)" : "(draft)"}
        </p>
      </div>

      <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/50 p-6 dark:border-amber-700 dark:bg-amber-950/30">
        <p className="mb-4 text-xs font-medium text-amber-800 dark:text-amber-200">
          Submissions on this page are not saved.
        </p>

        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{survey.name}</h1>
          {survey.description && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {survey.description}
            </p>
          )}
        </header>

        <div className="mt-6">
          {survey.steps.length === 0 ? (
            <p className="text-sm text-slate-500">No steps yet — add some in the editor.</p>
          ) : (
            <SurveyForm survey={survey} mode="preview" />
          )}
        </div>
      </div>
    </section>
  );
}
