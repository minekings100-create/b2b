import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "Supabase admin client must never be imported from a client component",
  );
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!serviceRoleKey || !url) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set",
  );
}

/**
 * Service-role client. Bypasses RLS. Legitimate uses:
 *   - Seed scripts
 *   - Migration-adjacent tasks
 *   - Server Actions that legitimately need to read across tenants
 *     (e.g. the nightly overdue-invoice cron in Phase 5)
 *
 * Never use from UI flows. Prefer the request-scoped server client and rely
 * on RLS.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(url!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
