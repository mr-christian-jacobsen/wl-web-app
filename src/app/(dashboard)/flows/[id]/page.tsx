import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FlowEditor } from "@/components/flows/FlowEditor";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  const flow = await prisma.flow.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      name: true,
      description: true,
      steps: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, type: true, title: true, notes: true },
      },
    },
  });
  if (!flow) notFound();

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href="/flows"
        className="text-sm text-slate-500 hover:underline"
      >
        ← All flows
      </Link>
      <FlowEditor flow={flow} />
    </section>
  );
}
