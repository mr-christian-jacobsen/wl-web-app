"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
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

export function ProfileEditor({ user }: { user: User }) {
  const router = useRouter();
  const { update } = useSession();

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
      <PasswordSection />
      <Section title="Sign out">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Sign out
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
  onUpdated: (url: string) => void;
}) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setStatus({ kind: "idle" });
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
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

  return (
    <Section title="Profile image" description="JPEG, PNG, or WebP. Max 2 MB.">
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
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {pending ? "Uploading…" : "Upload new image"}
          </button>
        </div>
      </div>
      <StatusLine status={status} />
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
    <Section title="Account details">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" defaultValue={user.name} required className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="email">
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
            {pending ? "Saving…" : "Save changes"}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
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
    <Section title="Change password" description="You'll need your current password to confirm.">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="currentPassword">
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        <Field label="New password" htmlFor="newPassword">
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
            {pending ? "Updating…" : "Update password"}
          </button>
          <StatusLine status={status} />
        </div>
      </form>
    </Section>
  );
}
