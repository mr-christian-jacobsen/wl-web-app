import { SurveysList } from "@/components/super-admin/SurveysList";
import { prisma } from "@/lib/db";

export default async function SurveysPage() {
  const surveys = await prisma.survey.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { steps: true } },
    },
  });

  const initial = surveys.map(({ _count, createdAt, updatedAt, ...rest }) => ({
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    stepCount: _count.steps,
  }));

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Surveys</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Create, edit, and organise multi-step surveys.
        </p>
      </div>
      <SurveysList initial={initial} />
    </section>
  );
}
