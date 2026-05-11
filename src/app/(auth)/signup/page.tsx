import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "@/components/forms/SignupForm";
import { getServerT } from "@/lib/translations.server";

export default async function SignupPage() {
  const t = await getServerT();
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title={t("auth.signup.title")}
        subtitle={t("auth.signup.subtitle")}
        footer={
          <span>
            {t("auth.signup.footer.have_account")}{" "}
            <Link
              href="/login"
              className="font-medium text-slate-900 underline dark:text-slate-100"
            >
              {t("auth.signup.footer.sign_in")}
            </Link>
          </span>
        }
      >
        <SignupForm />
      </AuthCard>
    </section>
  );
}
