import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "@/components/forms/SignupForm";

export default function SignupPage() {
  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <AuthCard
        title="Create your account"
        subtitle="Get started in under a minute."
        footer={
          <span>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-slate-900 underline dark:text-slate-100">
              Sign in
            </Link>
          </span>
        }
      >
        <SignupForm />
      </AuthCard>
    </section>
  );
}
