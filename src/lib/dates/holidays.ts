import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Phase 7b-1 — public-holidays loader.
 *
 * Reads the `public_holidays` table (seeded with NL holidays for
 * 2026 + 2027 in migration 20260420000001) and returns one Date per
 * row, suitable for passing into the working-days helper's `holidays`
 * opt.
 *
 * Postgres `date` columns serialise as `'YYYY-MM-DD'` (no time / no
 * tz). `new Date('YYYY-MM-DD')` parses that as UTC midnight, which —
 * because Amsterdam is always UTC+1 or UTC+2 — lands on the correct
 * local Amsterdam date (01:00 or 02:00 local). The working-days
 * helper compares by local day in `Europe/Amsterdam` via
 * `Intl.DateTimeFormat`, so the time component is irrelevant.
 *
 * Fail-soft: on a DB error we log loudly and return [] (= revert to
 * Mon–Fri-only behaviour, the pre-7b-1 baseline). The cron then
 * cancels slightly more aggressively across a holiday than intended,
 * but it does not crash. Operators should grep server logs for
 * `[holidays] load failed` after a cron tick.
 */

export const DEFAULT_REGION = "NL";

export async function loadActiveHolidays(
  db: SupabaseClient<Database>,
  region: string = DEFAULT_REGION,
): Promise<Date[]> {
  const { data, error } = await db
    .from("public_holidays")
    .select("date")
    .eq("region", region);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[holidays] load failed for region=${region}: ${error.message}`,
    );
    return [];
  }
  return (data ?? []).map((r) => new Date(r.date));
}
