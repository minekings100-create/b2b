/**
 * Date formatting helpers shared across UI surfaces (activity timeline,
 * notifications dropdown, audit-log viewer when it lands). Pure module —
 * no DB, no `server-only`. Keep symmetric with `working-days.ts`.
 */

const TZ = "Europe/Amsterdam";

/** "18 Apr 2026, 14:30" — the standard absolute timestamp shown in tables + tooltips. */
export function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/**
 * "18 Apr 2026" — same day/month/year as `formatAbsolute` but without
 * the time. Use anywhere you'd otherwise drop the ISO date straight into
 * the UI. Copy pass (Sprint 3) made this the one canonical short form.
 */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

/** "5 minutes ago" / "2 days ago" / "3 hours from now". Matches the §4 micro-copy style. */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  const abs = Math.abs(sec);
  const past = sec >= 0;
  const fmt = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"} ${past ? "ago" : "from now"}`;
  if (abs < 60) return fmt(abs, "second");
  const min = Math.round(abs / 60);
  if (min < 60) return fmt(min, "minute");
  const hr = Math.round(abs / 3600);
  if (hr < 24) return fmt(hr, "hour");
  const day = Math.round(abs / 86400);
  if (day < 30) return fmt(day, "day");
  const mon = Math.round(abs / 2592000);
  if (mon < 12) return fmt(mon, "month");
  return fmt(Math.round(abs / 31536000), "year");
}
