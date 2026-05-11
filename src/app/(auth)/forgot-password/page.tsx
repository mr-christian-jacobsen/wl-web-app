import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import { getServerT } from "@/lib/translations.server";

export default async function ForgotPasswordPage() {
  const t = await getServerT();
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title={t("auth.forgot.title")}
        subtitle={t("auth.forgot.subtitle")}
        footer={
          <Link
            href="/login"
            className="font-medium text-slate-900 underline dark:text-slate-100"
          >
            {t("auth.forgot.footer.back")}
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </section>
  );
}
