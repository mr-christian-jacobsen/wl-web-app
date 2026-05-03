"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type EmailRow = {
  id: string;
  to: string;
  type: string;
  templateKey: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  status: string;
  error: string | null;
  /** Pre-formatted on the server to avoid locale-dependent hydration mismatch. */
  sentAtDisplay: string;
  user: { id: string; email: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  user_invitation: "User invitation",
  email_verification: "Email verification",
  password_reset: "Password reset",
  email_change_confirmation: "Email change",
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  skipped: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

type Tab = "html" | "text";

type ResendResult = {
  id: string;
  status: string;
  error: string | null;
  sentAtDisplay: string;
};

export function EmailsTable({ emails: initialEmails }: { emails: EmailRow[] }) {
  const router = useRouter();
  const [emails, setEmails] = useState(initialEmails);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? emails.find((e) => e.id === selectedId) ?? null : null;

  function applyResend(updated: ResendResult) {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === updated.id
          ? {
              ...e,
              status: updated.status,
              error: updated.error,
              sentAtDisplay: updated.sentAtDisplay,
            }
          : e,
      ),
    );
    router.refresh();
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {emails.map((e) => (
              <tr
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className="cursor-pointer align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                  {e.sentAtDisplay}
                </td>
                <td className="px-4 py-3">
                  <div>{e.to}</div>
                  {e.user && e.user.email !== e.to && (
                    <div className="text-xs text-slate-500">user: {e.user.email}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs">
                    {TYPE_LABELS[e.type] ?? e.type}
                  </span>
                  {!e.templateKey && (
                    <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      fallback
                    </span>
                  )}
                </td>
                <td className="max-w-md px-4 py-3 text-slate-700 dark:text-slate-200">
                  <div className="truncate" title={e.subject}>
                    {e.subject}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[e.status] ?? STATUS_BADGE.pending}`}
                  >
                    {e.status}
                  </span>
                  {e.error && (
                    <div className="mt-1 max-w-xs truncate text-xs text-red-600" title={e.error}>
                      {e.error}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {emails.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No emails sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <EmailDetailDialog
          email={selected}
          onClose={() => setSelectedId(null)}
          onResent={applyResend}
        />
      )}
    </>
  );
}

function EmailDetailDialog({
  email,
  onClose,
  onResent,
}: {
  email: EmailRow;
  onClose: () => void;
  onResent: (r: ResendResult) => void;
}) {
  const [tab, setTab] = useState<Tab>(email.bodyHtml ? "html" : "text");
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const canResend = email.status === "skipped" || email.status === "failed";

  async function onResend() {
    setResending(true);
    setResendError(null);
    const res = await fetch(`/api/super-admin/emails/${email.id}/resend`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setResendError(body?.error ?? "Resend failed");
      setResending(false);
      return;
    }
    const body = (await res.json()) as { email: ResendResult };
    onResent(body.email);
    setResending(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold" title={email.subject}>
              {email.subject}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {TYPE_LABELS[email.type] ?? email.type}
              {!email.templateKey && (
                <span className="ml-2 rounded bg-slate-100 px-1 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  fallback
                </span>
              )}
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[email.status] ?? STATUS_BADGE.pending}`}
              >
                {email.status}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {canResend && (
              <button
                type="button"
                onClick={onResend}
                disabled={resending}
                className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {resending ? "Resending…" : "Resend"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>

        {resendError && (
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">
            {resendError}
          </p>
        )}

        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold text-slate-500">To</dt>
          <dd className="break-all">{email.to}</dd>
          {email.user && email.user.email !== email.to && (
            <>
              <dt className="font-semibold text-slate-500">User</dt>
              <dd className="break-all">{email.user.email}</dd>
            </>
          )}
          <dt className="font-semibold text-slate-500">Sent at</dt>
          <dd>{email.sentAtDisplay}</dd>
          <dt className="font-semibold text-slate-500">Template key</dt>
          <dd className="font-mono">{email.templateKey ?? <span className="text-slate-500">— (built-in fallback)</span>}</dd>
          {email.error && (
            <>
              <dt className="font-semibold text-slate-500">Error</dt>
              <dd className="break-words text-red-600">{email.error}</dd>
            </>
          )}
        </dl>

        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
          {(["html", "text"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={t === "html" && !email.bodyHtml}
              onClick={() => setTab(t)}
              className={
                "rounded-t-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 " +
                (tab === t
                  ? "border-x border-t border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")
              }
            >
              {t === "html" ? "HTML" : "Plain text"}
            </button>
          ))}
        </div>

        {tab === "html" &&
          (email.bodyHtml ? (
            <iframe
              title={`Email body for ${email.id}`}
              sandbox=""
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: #0f172a; background: #ffffff;">${email.bodyHtml}</body></html>`}
              className="h-96 w-full rounded-md border border-slate-200 bg-white dark:border-slate-800"
            />
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              No HTML body — only the plain-text version was sent.
            </p>
          ))}

        {tab === "text" && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed dark:border-slate-800 dark:bg-slate-950">
            {email.bodyText}
          </pre>
        )}
      </div>
    </div>
  );
}
