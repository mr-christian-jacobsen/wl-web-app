import {
  getLogRetention,
  getSmtpSettings,
  getTranslateSettings,
} from "@/lib/system-settings";
import { getServerT } from "@/lib/translations.server";

import { LogRetentionForm } from "@/components/super-admin/LogRetentionForm";
import { SmtpSettingsForm } from "@/components/super-admin/SmtpSettingsForm";
import { TranslateProviderForm } from "@/components/super-admin/TranslateProviderForm";

export default async function SuperAdminSystemSettingsPage() {
  const [smtp, retention, translate, t] = await Promise.all([
    getSmtpSettings(),
    getLogRetention(),
    getTranslateSettings(),
    getServerT(),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t("super_admin.system_settings.title")}</h2>
        <p className="text-sm text-slate-500">
          {t("super_admin.system_settings.description")}
        </p>
      </div>

      <SmtpSettingsForm initial={smtp} />
      <TranslateProviderForm initial={translate} />
      <LogRetentionForm initial={retention} />
    </section>
  );
}
