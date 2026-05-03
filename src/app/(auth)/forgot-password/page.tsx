import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title="Reset your password"
        subtitle="Enter the email associated with your account."
        footer={
          <Link href="/login" className="font-medium text-slate-900 underline dark:text-slate-100">
            Back to sign in
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </section>
  );
}
