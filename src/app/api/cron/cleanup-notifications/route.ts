import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  amsterdamHourNow,
  isExpectedAmsterdamHour,
} from "@/lib/dates/dst-cron";

/**
 * Phase 7b-1 — DESTRUCTIVE 90-day notification cleanup (BACKLOG §Phase 7).
 *
 * Hard-deletes rows in `notifications` where:
 *   sent_at < now() - interval '90 days' AND read_at IS NOT NULL
 *
 * Unread notifications are NEVER deleted, regardless of age — a
 * 6-month-old unread row stays so the user still sees it next time
 * they open the bell. Cleanup is for tidying up acknowledged history,
 * not for erasing things the user never saw.
 *
 * Atomicity: the actual SELECT → audit INSERT → DELETE happens inside
 * the `cleanup_old_notifications` SQL function (migration
 * 20260420000002), wrapped in a single statement using modifying CTEs.
 * Audit happens BEFORE delete and both commit-or-rollback together —
 * a partial failure can never leave deleted rows without an audit
 * trail.
 *
 * Hard cap: 10 000 deletions per run (passed as p_max_count). A backlog
 * larger than that gets chipped down weekly. The response surface
 * `capped: true` so a long-running backlog is observable.
 *
 * Schedule: weekly Sunday 06:00 Europe/Amsterdam — vercel.json ships
 * two UTC schedules and the in-handler `isExpectedAmsterdamHour(6)`
 * gate suppresses the off-target firing per Phase 7b-1's DST strategy.
 *
 * Auth: production sets CRON_SECRET; Vercel Cron sends the matching
 * Bearer header automatically. Local + e2e leave the secret unset so
 * the route is callable directly for tests.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RETENTION_DAYS = 90;
const TARGET_AMS_HOUR = 6;
const MAX_DELETIONS_PER_RUN = 10_000;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // DST gate — production-only so e2e can hit the cron at any time.
  // The `secret` presence is the production signal we already use for
  // auth above; matches the pattern in the other three crons.
  if (secret && !isExpectedAmsterdamHour(TARGET_AMS_HOUR)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_target_hour",
      target_hour_ams: TARGET_AMS_HOUR,
      actual_hour_ams: amsterdamHourNow(),
    });
  }

  const adm = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await adm.rpc("cleanup_old_notifications", {
    p_cutoff: cutoff.toISOString(),
    p_retention_days: RETENTION_DAYS,
    p_max_count: MAX_DELETIONS_PER_RUN,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  // The function returns `setof record (deleted_count int, capped bool)`
  // which postgrest serialises as a one-element array.
  const row = Array.isArray(data) ? data[0] : data;
  const deletedCount = row?.deleted_count ?? 0;
  const capped = row?.capped ?? false;

  return NextResponse.json({
    ok: true,
    cutoff: cutoff.toISOString(),
    retention_days: RETENTION_DAYS,
    deleted_count: deletedCount,
    capped,
  });
}
