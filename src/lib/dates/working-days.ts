/**
 * Working-days helper. Pure module — no DB, no `server-only` so the
 * vitest suite can import it directly. Reused by:
 *   - 3.2.2c auto-cancel cron (`/api/cron/auto-cancel-stale-orders`)
 *   - Phase 5 invoice `due_at` arithmetic (planned)
 *   - Any future SLA timer keyed off business days
 *
 * Working days = Mon–Fri in `Europe/Amsterdam` (default tz). Sat/Sun are
 * always non-working. Public holidays are NOT enforced today — the
 * `holidays` option is plumbed through the API so the Phase 7 polish
 * pass can wire NL public holidays without API churn.
 *
 * Time-of-day is preserved across `addWorkingDays` arithmetic. The cron
 * uses `addWorkingDays(now, -2)` as a cutoff and compares
 * `submitted_at < cutoff` — so an order submitted Mon 14:00 and probed
 * Wed 08:00 returns 1.7 working days (NOT yet stale at the 2-day SLA),
 * which is the SPEC §8.8 intent.
 */

const DEFAULT_TZ = "Europe/Amsterdam";

export type WorkingDayOpts = {
  /** IANA timezone for "what day is this?" — defaults to Europe/Amsterdam. */
  tz?: string;
  /**
   * Dates that should count as non-working in the given tz.
   * Comparison is by local-day (not by exact instant), so the time
   * portion of each holiday is irrelevant. Wired through the API today;
   * Phase 7 will inject NL public holidays.
   */
  holidays?: ReadonlyArray<Date>;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0 = Sun, 1 = Mon, …, 6 = Sat
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localParts(date: Date, tz: string): LocalParts {
  // Intl.DateTimeFormat is the only stdlib path that respects DST + tz
  // without pulling in a tz database. The `formatToParts` shape is
  // stable across V8 / WebKit / SpiderMonkey.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

function ymdKey(date: Date, tz: string): string {
  const { year, month, day } = localParts(date, tz);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * True if `date` falls on Mon–Fri in the given tz AND is not in the
 * supplied holidays list. Time-of-day is irrelevant — the check is
 * purely on the calendar day.
 */
export function isWorkingDay(date: Date, opts?: WorkingDayOpts): boolean {
  const tz = opts?.tz ?? DEFAULT_TZ;
  const { weekday } = localParts(date, tz);
  if (weekday === 0 || weekday === 6) return false;
  if (opts?.holidays?.length) {
    const key = ymdKey(date, tz);
    for (const h of opts.holidays) {
      if (ymdKey(h, tz) === key) return false;
    }
  }
  return true;
}

/**
 * Add `n` working days to `date`. Negative `n` subtracts. Time-of-day
 * is preserved (UTC component is shifted in 24h chunks).
 *
 * Examples (in Europe/Amsterdam, no holidays):
 *   addWorkingDays(Mon 14:00, 1)   → Tue 14:00
 *   addWorkingDays(Fri 14:00, 1)   → Mon 14:00
 *   addWorkingDays(Wed 08:00, -2)  → Mon 08:00
 *   addWorkingDays(Sun 14:00, 1)   → Mon 14:00 then Tue 14:00 = Tue 14:00
 *     (Sun starts non-working; first step lands on Mon and counts that)
 */
export function addWorkingDays(
  date: Date,
  n: number,
  opts?: WorkingDayOpts,
): Date {
  if (n === 0) return new Date(date.getTime());
  const dir = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  const cur = new Date(date.getTime());
  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() + dir);
    if (isWorkingDay(cur, opts)) remaining -= 1;
  }
  return cur;
}

/**
 * Count whole working days strictly between `a` and `b` (exclusive of
 * `a`, inclusive of `b`). Sign reflects direction (`a` before `b` →
 * positive). The exact same iteration model as `addWorkingDays`, so
 * the two stay self-consistent.
 *
 * Not used by the auto-cancel cron itself (the cron compares against
 * `addWorkingDays(now, -N)`); shipped here because Phase 5 invoice
 * `due_at` calculation needs it.
 */
export function workingDaysBetween(
  a: Date,
  b: Date,
  opts?: WorkingDayOpts,
): number {
  if (a.getTime() === b.getTime()) return 0;
  const forward = a < b;
  const start = forward ? a : b;
  const end = forward ? b : a;
  const cur = new Date(start.getTime());
  let count = 0;
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur > end) break;
    if (isWorkingDay(cur, opts)) count += 1;
  }
  return forward ? count : -count;
}
