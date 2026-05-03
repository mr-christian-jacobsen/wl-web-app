import { prisma } from "@/lib/db";
import { KNOWN_TEMPLATES } from "@/lib/templates";

import { EmailTemplatesTable } from "@/components/super-admin/EmailTemplatesTable";

export default async function SuperAdminEmailTemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
  });
  const definedKeys = new Set(templates.map((t) => t.key));

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">Templates the app uses</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          These keys are referenced from code. Define a template with the matching key to
          customise the email; otherwise, the built-in fallback is used so flows never break.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {KNOWN_TEMPLATES.map((t) => {
            const defined = definedKeys.has(t.key);
            return (
              <li
                key={t.key}
                className="flex flex-col gap-1 rounded-md border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <div>
                  <code className="font-mono text-xs">{t.key}</code>{" "}
                  <span
                    className={
                      "ml-1 rounded px-1.5 py-0.5 text-xs " +
                      (defined
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200")
                    }
                  >
                    {defined ? "defined" : t.hasFallback ? "fallback" : "missing"}
                  </span>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{t.description}</p>
                </div>
                <p className="font-mono text-xs text-slate-500">
                  vars: {t.variables.map((v) => `{{${v}}}`).join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Templates</h2>
        <p className="text-sm text-slate-500">{templates.length} total</p>
      </div>
      <EmailTemplatesTable
        initialTemplates={templates.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        }))}
      />
    </section>
  );
}
