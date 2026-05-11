import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";
import { getServerT } from "@/lib/translations.server";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getServerT();
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
        <ResetPasswordForm token={token} />
      </AuthCard>
    </section>
  );
}
