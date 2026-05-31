/**
 * Placeholder slot for the header notification bell.
 *
 * U9 ships the `(dashboard)` layout and `/super-admin` layout with a
 * fixed seat for the bell so the header chrome is settled before U11
 * adds the real component. Renders nothing — no badge, no dropdown.
 *
 * U11 will replace the import in `src/app/(dashboard)/layout.tsx` (and
 * `src/app/super-admin/layout.tsx`) with the real
 * `<NotificationBell />` component without further layout reshuffling.
 *
 * Plain server component — no `"use client"` because rendering null
 * doesn't need a runtime. Cheap to keep here so the layout doesn't get
 * conditional JSX that would later have to be undone.
 */
export function NotificationBellSlot() {
  return null;
}
