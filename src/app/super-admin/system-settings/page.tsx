import { getSmtpSettings } from "@/lib/system-settings";

import { SmtpSettingsForm } from "@/components/super-admin/SmtpSettingsForm";

export default async function SuperAdminSystemSettingsPage() {
  const smtp = await getSmtpSettings();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">System settings</h2>
        <p className="text-sm text-slate-500">
          Runtime configuration. Changes here override the matching{" "}
          <code className="font-mono text-xs">.env</code> values.
        </p>
      </div>

      <SmtpSettingsForm initial={smtp} />
    </section>
  );
}
