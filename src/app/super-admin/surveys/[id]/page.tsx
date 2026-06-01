import Link from "next/link";
import { notFound } from "next/navigation";

import { SurveyEditor } from "@/components/super-admin/SurveyEditor";
import { prisma } from "@/lib/db";
import { getSurveyTagIds, listTagsForPicker } from "@/lib/tags";

export default async function SurveyEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [survey, initialTagIds, tagPickerGroups] = await Promise.all([
    prisma.survey.findUnique({
      where: { id },
      select: {
        id: true,
        publicSlug: true,
        name: true,
        description: true,
        published: true,
        publishedAt: true,
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
    }),
    getSurveyTagIds(id),
    listTagsForPicker(),
  ]);
  if (!survey) notFound();

  return (
    <section className="flex w-full flex-col gap-6">
      <Link
        href="/super-admin/surveys"
        className="text-sm text-slate-500 hover:underline"
      >
        ← All surveys
      </Link>
      <SurveyEditor
        survey={{
          ...survey,
          publishedAt: survey.publishedAt?.toISOString() ?? null,
        }}
        initialTagIds={initialTagIds}
        tagPickerGroups={tagPickerGroups}
      />
    </section>
  );
}
