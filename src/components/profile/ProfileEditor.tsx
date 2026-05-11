"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { AvatarCropper } from "@/components/profile/AvatarCropper";
import { ThemeToggle } from "@/components/profile/ThemeToggle";
import { useTranslation } from "@/components/TranslationsProvider";
import { flagEmoji, formatLocaleLabel } from "@/lib/locales";

type ThemeMode = "light" | "dark" | "system";

type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  languageId: string | null;
  themePreference: string | null;
};

export type LanguageOption = {
  id: string;
  countryCode: string;
  languageCode: string;
  isDefault: boolean;
};

type Status = { kind: "idle" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  return (
    <p
      className={
        status.kind === "ok"
          ? "mt-3 text-sm text-emerald-700"
          : "mt-3 text-sm text-red-600"
      }
    >
      {status.msg}
    </p>
  );
}

export function ProfileEditor({
  user,
  languages,
}: {
  user: User;
  languages: LanguageOption[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { update } = useSession();

  const initialTheme: ThemeMode =
    user.themePreference === "light" || user.themePreference === "dark"
      ? user.themePreference
      : "system";

  return (
    <div className="flex flex-col gap-6">
      <AvatarSection user={user} onUpdated={(url) => update({ avatarUrl: url })} />
      <DetailsSection
        user={user}
        onUpdated={(patch) => {
          update(patch);
          router.refresh();
        }}
      />
      <LanguageSection user={user} languages={languages} onUpdated={() => router.refresh()} />
      <Section
        title={t("profile.section.appearance.title")}
        description={t("profile.section.appearance.description")}
      >
        <ThemeToggle initial={initialTheme} />
      </Section>
      <PasswordSection />
      <Section title={t("profile.section.signout.title")}>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t("profile.section.signout.button")}
        </button>
      </Section>
    </div>
  );
}

function AvatarSection({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: "idle" });
    setPickedFile(file);
    // Reset the input so picking the same file twice in a row still triggers
    // the change event.
    e.target.value = "";
  }

  async function onCropConfirm(blob: Blob) {
    setPending(true);
    setStatus({ kind: "idle" });
    const fd = new FormData();
    fd.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
    setPickedFile(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Upload failed" });
      setPending(false);
      return;
    }
    const body = (await res.json()) as { avatarUrl: string };
    setAvatarUrl(body.avatarUrl);
    onUpdated(body.avatarUrl);
    setStatus({ kind: "ok", msg: "Avatar updated" });
    setPending(false);
  }

  async function onRemove() {
    if (!confirm(t("profile.section.avatar.remove_confirm"))) return;
    setPending(true);
    setStatus({ kind: "idle" });
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Remove failed" });
      setPending(false);
      return;
    }
    setAvatarUrl(null);
    onUpdated(null);
    setStatus({ kind: "ok", msg: "Avatar removed" });
    setPending(false);
  }

  return (
    <Section
      title={t("profile.section.avatar.title")}
      description={t("profile.section.avatar.description")}
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-slate-500">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {pending
              ? t("profile.section.avatar.uploading")
              : t("profile.section.avatar.upload")}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              {t("profile.section.avatar.remove")}
            </button>
          )}
        </div>
      </div>
      <StatusLine status={status} />
      {pickedFile && (
        <AvatarCropper
          file={pickedFile}
          onCancel={() => setPickedFile(null)}
          onConfirm={onCropConfirm}
        />
      )}
    </Section>
  );
}

function DetailsSection({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (patch: { name?: string; email?: string }) => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus({ kind: "idle" });
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const patch: Record<string, string> = {};
    if (data.name && data.name !== user.name) patch.name = data.name;
    if (data.email && data.email !== user.email) patch.email = data.email;
    if (Object.keys(patch).length === 0) {
      setStatus({ kind: "err", msg: "Nothing to update" });
      setPending(false);
      return;
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Update failed" });
      setPending(false);
      return;
    }
    const body = (await res.json()) as {
      user: { name: string; email: string };
      pendingEmailChange: { newEmail: string; message: string } | null;
    };
    // Only the name was applied immediately; the email change waits for
    // the user to click the confirmation link in the new inbox.
    onUpdated({ name: body.user.name });
    setStatus({
      kind: "ok",
      msg: body.pendingEmailChange
        ? body.pendingEmailChange.message + " Your email stays as-is until you confirm."
        : "Profile updated",
    });
    setPending(false);
  }

  return (
    <Section title={t("profile.section.details.title")}>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("profile.section.details.field.name")} htmlFor="name">
          <input id="name" name="name" defaultValue={user.name} required className={inputClass} />
        </Field>
        <Field label={t("profile.section.details.field.email")} htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={user.email}
            required
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending
              ? t("profile.section.details.saving")
              : t("profile.section.details.save")}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </Section>
  );
}

function LanguageSection({
  user,
  languages,
  onUpdated,
}: {
  user: User;
  languages: LanguageOption[];
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  // Empty string in the <select> represents "no preference" → null in
  // the JSON body, which the API translates into clearing the column so
  // the user follows the system default.
  const [value, setValue] = useState<string>(user.languageId ?? "");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const defaultLang = languages.find((l) => l.isDefault) ?? null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus({ kind: "idle" });
    const next = value === "" ? null : value;
    if (next === user.languageId) {
      setStatus({ kind: "err", msg: "Nothing to update" });
      setPending(false);
      return;
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ languageId: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Update failed" });
      setPending(false);
      return;
    }
    setStatus({ kind: "ok", msg: "Language preference saved" });
    setPending(false);
    onUpdated();
  }

  return (
    <Section
      title={t("profile.section.language.title")}
      description={t("profile.section.language.description")}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t("profile.section.language.field")} htmlFor="languageId">
          <select
            id="languageId"
            name="languageId"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
          >
            <option value="">
              {t("profile.section.language.site_default")}
              {defaultLang
                ? ` — ${formatLocaleLabel(defaultLang.countryCode, defaultLang.languageCode)}`
                : ""}
            </option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {flagEmoji(l.countryCode)} {formatLocaleLabel(l.countryCode, l.languageCode)}
                {l.isDefault ? " — Default" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending
              ? t("profile.section.details.saving")
              : t("profile.section.language.save")}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus({ kind: "idle" });
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "err", msg: body?.error ?? "Update failed" });
      setPending(false);
      return;
    }
    form.reset();
    setStatus({ kind: "ok", msg: "Password updated" });
    setPending(false);
  }

  return (
    <Section
      title={t("profile.section.password.title")}
      description={t("profile.section.password.description")}
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("profile.section.password.current")} htmlFor="currentPassword">
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        <Field label={t("profile.section.password.new")} htmlFor="newPassword">
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending
              ? t("profile.section.password.updating")
              : t("profile.section.password.update")}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </Section>
  );
}
