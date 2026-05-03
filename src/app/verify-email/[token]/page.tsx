import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { VerifyEmailRunner } from "@/components/VerifyEmailRunner";

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title="Confirming your email"
        footer={
          <Link href="/login" className="font-medium text-slate-900 underline dark:text-slate-100">
            Back to sign in
          </Link>
        }
      >
        <VerifyEmailRunner token={token} />
      </AuthCard>
    </section>
  );
}
