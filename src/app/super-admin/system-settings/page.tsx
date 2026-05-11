import {
  getLogRetention,
  getSmtpSettings,
  getTranslateSettings,
} from "@/lib/system-settings";

import { LogRetentionForm } from "@/components/super-admin/LogRetentionForm";
import { SmtpSettingsForm } from "@/components/super-admin/SmtpSettingsForm";
import { TranslateProviderForm } from "@/components/super-admin/TranslateProviderForm";

export default async function SuperAdminSystemSettingsPage() {
  const [smtp, retention, translate] = await Promise.all([
    getSmtpSettings(),
    getLogRetention(),
    getTranslateSettings(),
  ]);

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
      <TranslateProviderForm initial={translate} />
      <LogRetentionForm initial={retention} />
    </section>
  );
}
