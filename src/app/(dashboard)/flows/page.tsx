import { redirect } from "next/navigation";

import { FlowsList } from "@/components/flows/FlowsList";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function FlowsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const flows = await prisma.flow.findMany({
    where: { userId: session.user.id },
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

  const initial = flows.map(({ _count, createdAt, updatedAt, ...rest }) => ({
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    stepCount: _count.steps,
  }));

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Flows</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Create, edit, and organise the multi-step flows that belong to your account.
        </p>
      </div>
      <FlowsList initial={initial} />
    </section>
  );
}
