import Link from "next/link";

export function AuthCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
      <header className="space-y-1">
        <Link href="/" className="text-xs font-medium text-slate-500 hover:underline">
          ← Back home
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </header>
      {children}
      {footer && (
        <footer className="border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
          {footer}
        </footer>
      )}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-200";

export const buttonClass =
  "w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200";
