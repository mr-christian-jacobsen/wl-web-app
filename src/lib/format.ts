// Pinned locale + UTC so SSR and CSR render the same string regardless of the
// machine's locale or timezone. Used wherever a Date is shown to admins.
const ADMIN_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatAdminTimestamp(date: Date): string {
  return `${ADMIN_DATE_FMT.format(date)} UTC`;
}

/** @deprecated Use `formatAdminTimestamp`; kept for callers in /super-admin/emails. */
export const formatEmailSentAt = formatAdminTimestamp;
