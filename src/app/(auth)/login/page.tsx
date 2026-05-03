import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "@/components/forms/LoginForm";

export default function LoginPage() {
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title="Welcome back"
        subtitle="Sign in to manage your profile."
        footer={
          <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <Link href="/signup" className="font-medium text-slate-900 underline dark:text-slate-100">
              Create account
            </Link>
            <Link href="/forgot-password" className="text-slate-500 underline">
              Forgot password?
            </Link>
          </div>
        }
      >
        <LoginForm />
      </AuthCard>
    </section>
  );
}
