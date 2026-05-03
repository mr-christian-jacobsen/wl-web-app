import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard title="Choose a new password" subtitle="At least 8 characters.">
        <ResetPasswordForm token={token} />
      </AuthCard>
    </section>
  );
}
