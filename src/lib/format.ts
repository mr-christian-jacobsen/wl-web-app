// Pinned locale + UTC so SSR and CSR render the same string regardless of the
// machine's locale or timezone. Used wherever a Date is shown to admins.
const EMAIL_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatEmailSentAt(date: Date): string {
  return `${EMAIL_DATE_FMT.format(date)} UTC`;
}
