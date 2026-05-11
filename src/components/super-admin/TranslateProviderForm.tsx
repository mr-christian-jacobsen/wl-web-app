"use client";

import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { useTranslation } from "@/components/TranslationsProvider";
import type { TranslateSettings } from "@/lib/system-settings";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/**
 * Admin form for the auto-translate provider config. Mirrors the SMTP
 * form's conventions:
 *  - API keys are stored as secrets; we never read them back, only show
 *    a "configured / not configured" hint.
 *  - Submitting with an empty key field leaves the stored key untouched
 *    (so an admin can change the provider/model without re-typing).
 *  - The Clear button writes `null` so the key is removed.
 */
export function TranslateProviderForm({ initial }: { initial: TranslateSettings }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(initial);
  const [provider, setProvider] = useState(initial.provider);
  const [anthropicModel, setAnthropicModel] = useState(initial.anthropic.model);
  const [openaiModel, setOpenaiModel] = useState(initial.openai.model);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [deeplKey, setDeeplKey] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  async function patch(payload: Record<string, unknown>) {
    setSave({ kind: "saving" });
    const res = await fetch("/api/super-admin/system-settings/translate-provider", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setSave({ kind: "error", message: body?.error ?? "Save failed" });
      return;
    }
    const body = (await res.json()) as { settings: TranslateSettings };
    setSettings(body.settings);
    setProvider(body.settings.provider);
    setAnthropicModel(body.settings.anthropic.model);
    setOpenaiModel(body.settings.openai.model);
    setAnthropicKey("");
    setOpenaiKey("");
    setDeeplKey("");
    setSave({ kind: "saved" });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await patch({
      provider,
      anthropicModel,
      openaiModel,
      // Empty string from the input means "leave it alone".
      ...(anthropicKey.length > 0 ? { anthropicApiKey: anthropicKey } : {}),
      ...(openaiKey.length > 0 ? { openaiApiKey: openaiKey } : {}),
      ...(deeplKey.length > 0 ? { deeplApiKey: deeplKey } : {}),
    });
  }

  async function clearKey(which: "anthropic" | "openai" | "deepl") {
    if (!confirm(t("super_admin.translate_provider.clear_confirm"))) return;
    const patchBody: Record<string, unknown> = { provider };
    if (which === "anthropic") patchBody.anthropicApiKey = null;
    else if (which === "openai") patchBody.openaiApiKey = null;
    else patchBody.deeplApiKey = null;
    await patch(patchBody);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2 className="text-base font-semibold">
          {t("super_admin.translate_provider.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("super_admin.translate_provider.description")}
        </p>
      </div>

      <Field
        label={t("super_admin.translate_provider.field.provider")}
        htmlFor="provider"
      >
        <select
          id="provider"
          value={provider}
          onChange={(e) =>
            setProvider(e.target.value as "anthropic" | "openai" | "deepl")
          }
          className={inputClass}
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
          <option value="deepl">DeepL</option>
        </select>
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Anthropic
        </legend>
        <Field
          label={t("super_admin.translate_provider.field.model")}
          htmlFor="anthropicModel"
        >
          <input
            id="anthropicModel"
            value={anthropicModel}
            onChange={(e) => setAnthropicModel(e.target.value)}
            placeholder="claude-haiku-4-5"
            className={inputClass}
          />
        </Field>
        <Field
          label={t("super_admin.translate_provider.field.api_key")}
          htmlFor="anthropicApiKey"
        >
          <input
            id="anthropicApiKey"
            type="password"
            autoComplete="off"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder={
              settings.anthropic.hasApiKey
                ? t("super_admin.translate_provider.api_key.set_placeholder")
                : t("super_admin.translate_provider.api_key.unset_placeholder")
            }
            className={inputClass}
          />
        </Field>
        {settings.anthropic.hasApiKey && (
          <button
            type="button"
            onClick={() => clearKey("anthropic")}
            className="self-start rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {t("super_admin.translate_provider.clear_button")}
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          OpenAI
        </legend>
        <Field
          label={t("super_admin.translate_provider.field.model")}
          htmlFor="openaiModel"
        >
          <input
            id="openaiModel"
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className={inputClass}
          />
        </Field>
        <Field
          label={t("super_admin.translate_provider.field.api_key")}
          htmlFor="openaiApiKey"
        >
          <input
            id="openaiApiKey"
            type="password"
            autoComplete="off"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={
              settings.openai.hasApiKey
                ? t("super_admin.translate_provider.api_key.set_placeholder")
                : t("super_admin.translate_provider.api_key.unset_placeholder")
            }
            className={inputClass}
          />
        </Field>
        {settings.openai.hasApiKey && (
          <button
            type="button"
            onClick={() => clearKey("openai")}
            className="self-start rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {t("super_admin.translate_provider.clear_button")}
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          DeepL
        </legend>
        <Field
          label={t("super_admin.translate_provider.field.api_key")}
          htmlFor="deeplApiKey"
        >
          <input
            id="deeplApiKey"
            type="password"
            autoComplete="off"
            value={deeplKey}
            onChange={(e) => setDeeplKey(e.target.value)}
            placeholder={
              settings.deepl.hasApiKey
                ? t("super_admin.translate_provider.api_key.set_placeholder")
                : t("super_admin.translate_provider.api_key.unset_placeholder")
            }
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("super_admin.translate_provider.deepl.hint")}
        </p>
        {settings.deepl.hasApiKey && (
          <button
            type="button"
            onClick={() => clearKey("deepl")}
            className="self-start rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            {t("super_admin.translate_provider.clear_button")}
          </button>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="submit" disabled={save.kind === "saving"} className={buttonClass + " w-auto"}>
          {save.kind === "saving"
            ? t("super_admin.translations.saving")
            : t("super_admin.translate_provider.save")}
        </button>
        {save.kind === "saved" && (
          <p className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            {t("super_admin.translations.saved")}
          </p>
        )}
        {save.kind === "error" && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">
            {save.message}
          </p>
        )}
      </div>
    </form>
  );
}
