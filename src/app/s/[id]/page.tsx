import { notFound } from "next/navigation";

import { SurveyForm } from "@/components/surveys/SurveyForm";
import { prisma } from "@/lib/db";

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const survey = await prisma.survey.findUnique({
    where: { id },
    select: {
      id: true,
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

  if (!survey || !survey.published) notFound();

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{survey.name}</h1>
        {survey.description && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {survey.description}
          </p>
        )}
      </header>
      <SurveyForm survey={survey} mode="live" />
    </section>
  );
}
