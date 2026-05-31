"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/components/TranslationsProvider";

/**
 * Header notification bell (R15, R16, R21). Single consumer — the
 * dropdown content is inlined here per the P1 resolution, no separate
 * `NotificationsList.tsx`.
 *
 * Lifecycle:
 *  - Initial unread count comes from the parent layout as a prop, so
 *    the badge renders correctly on first paint without a flash of
 *    "0 → N".
 *  - Opening the dropdown fetches `/api/notifications`, POSTs
 *    `/api/notifications/mark-read`, optimistically clears the badge,
 *    and visually flips each row to read state (rows stay visible per
 *    R16 — "marked read" is bookmark state, not deletion).
 *  - While the dropdown is open we poll every 30s so new notifications
 *    surface without a manual refresh. The interval is cleared the
 *    moment the dropdown closes (no work while not visible).
 *  - Closing via Escape, outside-click, or re-clicking the bell.
 *
 * Badge styling: hidden at 0, exact count 1–9, "9+" at 10+.
 *
 * The component is rendered identically from `(dashboard)/layout.tsx`
 * and `super-admin/layout.tsx` — both layouts pass the user's initial
 * unread count as a prop. The component holds its own client state
 * after mount.
 */

type TaskInstanceLink = {
  id: string;
  status: "pending" | "completed";
  task: {
    id: string;
    title: string;
    predicateKey: string | null;
  };
} | null;

type NotificationRow = {
  id: string;
  userId: string;
  type: string;
  taskInstanceId: string | null;
  unread: boolean;
  createdAt: string;
  taskInstance: TaskInstanceLink;
};

export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "GET",
        headers: { accept: "application/json" },
        // Cache busting: notifications are user-state, must always be fresh.
        cache: "no-store",
      });
      if (!res.ok) {
        setError(t("notifications.fetch_failed"));
        return;
      }
      const body = (await res.json()) as { notifications: NotificationRow[] };
      setRows(body.notifications);
    } catch {
      setError(t("notifications.fetch_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const markAllRead = useCallback(async () => {
    // Optimistic: drop badge to 0 and flip every row to read locally.
    setUnreadCount(0);
    setRows((cur) =>
      cur === null
        ? cur
        : cur.map((r) => (r.unread ? { ...r, unread: false } : r)),
    );
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
    } catch {
      // Swallow — the next fetch will reconcile. Mark-read failure is
      // not user-blocking; the bell badge being briefly wrong is a
      // soft failure mode we accept.
    }
  }, []);

  // When the dropdown opens: fetch + mark-read once, then poll every 30s
  // while it stays open. Effect cleanup tears the interval down on close
  // / unmount so no polling happens while invisible.
  useEffect(() => {
    if (!open) return;
    void fetchNotifications();
    void markAllRead();
    const id = window.setInterval(() => {
      void fetchNotifications();
    }, 30_000);
    return () => {
      window.clearInterval(id);
    };
  }, [open, fetchNotifications, markAllRead]);

  // Outside-click + Escape close the dropdown.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const node = containerRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge =
    unreadCount <= 0 ? null : unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? t("notifications.bell.unread_count", { n: unreadCount })
            : t("notifications.bell.aria_label")
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <BellIcon />
        {badge !== null && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[0.65rem] font-semibold leading-none text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>{t("notifications.bell.aria_label")}</span>
            <Link
              href="/tasks"
              onClick={() => setOpen(false)}
              className="font-medium text-slate-700 hover:underline dark:text-slate-200"
            >
              {t("notifications.see_all")}
            </Link>
          </div>
          <ul className="max-h-96 overflow-y-auto py-1">
            {error && (
              <li className="px-3 py-3 text-sm text-red-600">{error}</li>
            )}
            {!error && loading && rows === null && (
              <li className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
                {t("notifications.loading")}
              </li>
            )}
            {!error && rows !== null && rows.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {t("notifications.empty")}
              </li>
            )}
            {!error &&
              rows !== null &&
              rows.map((row) => {
                const title = row.taskInstance?.task.title ?? "";
                // For now every notification routes to /tasks. The
                // predicate's deep-link is rendered on /tasks itself
                // (the task row's deep-link CTA) so the bell stays
                // simple — one consistent target per notification type.
                const href = "/tasks";
                return (
                  <li key={row.id}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={
                        "flex flex-col gap-0.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 " +
                        (row.unread
                          ? "bg-slate-50/60 dark:bg-slate-800/40"
                          : "")
                      }
                    >
                      <span className="flex items-center gap-2 text-sm">
                        {row.unread && (
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full bg-red-600"
                          />
                        )}
                        <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {title || t("notifications.empty")}
                        </span>
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
