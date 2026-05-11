import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "@/components/forms/LoginForm";
import { getServerT } from "@/lib/translations.server";

export default async function LoginPage() {
  const t = await getServerT();
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title={t("auth.login.title")}
        subtitle={t("auth.login.subtitle")}
        footer={
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <Link
              href="/signup"
              className="font-medium text-slate-900 underline dark:text-slate-100"
            >
              {t("auth.login.footer.create_account")}
            </Link>
            <Link href="/forgot-password" className="text-slate-500 underline">
              {t("auth.login.footer.forgot_password")}
            </Link>
          </div>
        }
      >
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </AuthCard>
    </section>
  );
}
