/**
 * Phase 7b-1 — DST-aware cron hour gate.
 *
 * Vercel Cron schedules are UTC and have no native timezone awareness.
 * "Run at 08:00 Europe/Amsterdam every day" therefore drifts by ±1h
 * twice a year as the Netherlands flips between CET (UTC+1) and CEST
 * (UTC+2).
 *
 * The fix used by the cron handlers in this repo: schedule the same
 * route at TWO UTC times in `vercel.json` — one that matches summer
 * (CEST) and one that matches winter (CET) — and call this helper at
 * the top of the handler to bail when the current Amsterdam local hour
 * does not match the intended target. The off-DST-half firing returns
 * `{ ok: true, skipped: true }` and does no work.
 *
 * Pure module — no DB, no env, deterministic given `Date.now()` + the
 * `targetHour` arg. Safe to import from any cron route.
 */

const AMS_TZ = "Europe/Amsterdam";

/**
 * Returns true iff the current wall-clock hour in Europe/Amsterdam
 * equals `targetHour` (0-23).
 *
 * Implementation note: `Intl.DateTimeFormat` with `timeZone` is the
 * cheapest correct way to read a TZ-aware hour in Node — no extra
 * dependency, no manual DST math.
 */
export function isExpectedAmsterdamHour(
  targetHour: number,
  now: Date = new Date(),
): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: AMS_TZ,
    hour: "2-digit",
    hour12: false,
  });
  const hourStr = fmt.format(now);
  const hour = Number.parseInt(hourStr, 10);
  return hour === targetHour;
}

/**
 * Returns the current Amsterdam local hour as a number (0-23). Useful
 * for diagnostic responses ("we fired at amsterdam_hour=7 but target
 * was 8 — skipped").
 */
export function amsterdamHourNow(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: AMS_TZ,
    hour: "2-digit",
    hour12: false,
  });
  return Number.parseInt(fmt.format(now), 10);
}
