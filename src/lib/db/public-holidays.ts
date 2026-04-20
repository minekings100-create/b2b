import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Phase 7b-2a — admin read helper for `public_holidays`.
 *
 * Distinct from `src/lib/dates/holidays.ts` (which is the cron-side
 * loader that returns Dates for `addWorkingDays`). This module returns
 * full rows for the admin UI.
 *
 * Reads via the user session client — RLS allows any authenticated
 * user to read, and the admin page itself is super_admin-gated at the
 * page layer.
 */

export type AdminHolidayRow = {
  id: string;
  region: string;
  date: string; // YYYY-MM-DD
  name: string;
  created_at: string;
};

export async function fetchAdminHolidays(
  region: string = "NL",
): Promise<AdminHolidayRow[]> {
  const db = createClient();
  const { data, error } = await db
    .from("public_holidays")
    .select("id, region, date, name, created_at")
    .eq("region", region)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminHolidayRow[];
}
