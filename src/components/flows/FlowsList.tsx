"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, buttonClass, inputClass } from "@/components/AuthCard";

type FlowSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
};

export function FlowsList({ initial }: { initial: FlowSummary[] }) {
  const router = useRouter();
  const [flows, setFlows] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/flows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: data.name, description: data.description || null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not create flow");
      setPending(false);
      return;
    }
    const body = (await res.json()) as { flow: FlowSummary };
    setFlows((cur) => [body.flow, ...cur]);
    setCreating(false);
    setPending(false);
    router.push(`/flows/${body.flow.id}`);
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its steps?`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/flows/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? "Could not delete flow");
      setDeletingId(null);
      return;
    }
    setFlows((cur) => cur.filter((f) => f.id !== id));
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {flows.length === 0
            ? "You don't have any flows yet."
            : `${flows.length} flow${flows.length === 1 ? "" : "s"}`}
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setError(null);
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            New flow
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <Field label="Name" htmlFor="flow-name">
            <input
              id="flow-name"
              name="name"
              required
              maxLength={120}
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field label="Description (optional)" htmlFor="flow-description">
            <textarea
              id="flow-description"
              name="description"
              rows={3}
              maxLength={2000}
              className={inputClass}
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={buttonClass + " sm:w-auto"}>
              {pending ? "Creating…" : "Create flow"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {flows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          Click <span className="font-medium">New flow</span> to get started.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {flows.map((flow) => (
            <li
              key={flow.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <Link
                href={`/flows/${flow.id}`}
                className="flex min-w-0 flex-1 flex-col gap-1 hover:opacity-80"
              >
                <span className="truncate text-base font-medium">{flow.name}</span>
                {flow.description && (
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">
                    {flow.description}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {flow.stepCount} step{flow.stepCount === 1 ? "" : "s"} · updated{" "}
                  {new Date(flow.updatedAt).toLocaleDateString()}
                </span>
              </Link>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/flows/${flow.id}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(flow.id, flow.name)}
                  disabled={deletingId === flow.id}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {deletingId === flow.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
