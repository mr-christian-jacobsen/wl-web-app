"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";
import { flagEmoji, formatLocaleLabel } from "@/lib/locales";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  languageId: string | null;
  createdAt: string;
};

export type LanguageOption = {
  id: string;
  countryCode: string;
  languageCode: string;
  isDefault: boolean;
};

type Mode = { kind: "idle" } | { kind: "create" } | { kind: "edit"; user: AdminUser };

export function UsersTable({
  initialUsers,
  languages,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  languages: LanguageOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const languagesById = useMemo(
    () => new Map(languages.map((l) => [l.id, l])),
    [languages],
  );

  function refresh(next: AdminUser[]) {
    setUsers(next);
    router.refresh();
  }

  async function onDelete(user: AdminUser) {
    if (user.id === currentUserId) {
      setError("You can't delete your own account here.");
      return;
    }
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/super-admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Delete failed");
        return;
      }
      refresh(users.filter((u) => u.id !== user.id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode({ kind: "create" });
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          + New user
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Super admin</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">
                  {u.email}
                  {u.id === currentUserId && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-xs">
                  {u.languageId ? (
                    (() => {
                      const lang = languagesById.get(u.languageId);
                      return lang ? (
                        <span className="whitespace-nowrap">
                          <span className="mr-1" aria-hidden>
                            {flagEmoji(lang.countryCode)}
                          </span>
                          {lang.countryCode}-{lang.languageCode}
                        </span>
                      ) : (
                        <span className="text-slate-400">{u.languageId}</span>
                      );
                    })()
                  ) : (
                    <span className="text-slate-400">Default</span>
                  )}
                </td>
                <td className="px-4 py-3">{u.isSuperAdmin ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode({ kind: "edit", user: u });
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(u)}
                      disabled={pending}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode.kind !== "idle" && (
        <UserDialog
          mode={mode}
          languages={languages}
          onClose={() => setMode({ kind: "idle" })}
          onSaved={(saved, isCreate) => {
            if (isCreate) {
              refresh([saved, ...users]);
            } else {
              refresh(users.map((u) => (u.id === saved.id ? saved : u)));
            }
            setMode({ kind: "idle" });
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function UserDialog({
  mode,
  languages,
  onClose,
  onSaved,
  onError,
}: {
  mode: Exclude<Mode, { kind: "idle" }>;
  languages: LanguageOption[];
  onClose: () => void;
  onSaved: (user: AdminUser, isCreate: boolean) => void;
  onError: (msg: string) => void;
}) {
  const isCreate = mode.kind === "create";
  const initial = isCreate ? null : mode.user;
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Empty string in the <select> means "no preference" → null in the
  // payload, which clears the column on PATCH and leaves it unset on
  // POST (both result in the user following the system default).
  const [languageId, setLanguageId] = useState<string>(initial?.languageId ?? "");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setLocalError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      isSuperAdmin: fd.get("isSuperAdmin") === "on",
      languageId: languageId === "" ? null : languageId,
    };
    const password = String(fd.get("password") ?? "");
    if (password) payload.password = password;
    if (!isCreate && !password) delete payload.password;

    const url = isCreate
      ? "/api/super-admin/users"
      : `/api/super-admin/users/${initial!.id}`;
    const res = await fetch(url, {
      method: isCreate ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const msg = body?.error ?? `${isCreate ? "Create" : "Update"} failed`;
      setLocalError(msg);
      onError(msg);
      setPending(false);
      return;
    }
    const body = (await res.json()) as { user: AdminUser };
    onSaved(body.user, isCreate);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 className="text-lg font-semibold">{isCreate ? "Create user" : "Edit user"}</h3>
        {isCreate && (
          <p className="text-xs text-slate-500">
            On create, the <code className="font-mono">user_invitation</code> email is sent
            to the new user. Customise it at <em>/super-admin/email-templates</em>; if no
            template is defined, a built-in fallback is used. Variables:{" "}
            <code className="font-mono">{"{{name}}"}</code>,{" "}
            <code className="font-mono">{"{{email}}"}</code>,{" "}
            <code className="font-mono">{"{{password}}"}</code>,{" "}
            <code className="font-mono">{"{{loginUrl}}"}</code>.
          </p>
        )}
        <Field label="Name" htmlFor="name">
          <input
            id="name"
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            required
            className={inputClass}
          />
        </Field>
        <Field
          label={isCreate ? "Password" : "New password (leave blank to keep current)"}
          htmlFor="password"
        >
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required={isCreate}
            className={inputClass}
          />
        </Field>
        <Field label="Language" htmlFor="languageId">
          <select
            id="languageId"
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className={inputClass}
          >
            <option value="">Site default</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {flagEmoji(l.countryCode)} {formatLocaleLabel(l.countryCode, l.languageCode)}
                {l.isDefault ? " — Default" : ""}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isSuperAdmin"
            defaultChecked={initial?.isSuperAdmin ?? false}
            className="h-4 w-4 rounded border-slate-300"
          />
          Super admin
        </label>
        {localError && <p className="text-sm text-red-600">{localError}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button type="submit" disabled={pending} className={buttonClass + " w-auto"}>
            {pending ? "Saving…" : isCreate ? "Create user" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
