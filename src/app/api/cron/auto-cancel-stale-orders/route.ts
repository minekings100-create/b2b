import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { addWorkingDays } from "@/lib/dates/working-days";
import { loadActiveHolidays } from "@/lib/dates/holidays";
import {
  amsterdamHourNow,
  isExpectedAmsterdamHour,
} from "@/lib/dates/dst-cron";
import {
  adminAudience,
  hqManagers,
  managersForBranch,
  userById,
  type Recipient,
} from "@/lib/email/recipients";
import { notify } from "@/lib/email/notify";
import { renderOrderAutoCancelled } from "@/lib/email/templates";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Sub-milestone 3.2.2c — auto-cancel stale orders (SPEC §8.8).
 *
 * Schedule: 08:00 Europe/Amsterdam, year-round. `vercel.json` ships TWO
 * UTC schedules to handle DST: `0 6 * * *` matches 08:00 CEST (summer)
 * and `0 7 * * *` matches 08:00 CET (winter). The DST gate at the top
 * of GET (production only) suppresses the off-half firing.
 *
 * NL public holidays are loaded from `public_holidays` and threaded
 * into addWorkingDays so a holiday cluster (e.g. Pasen) doesn't count
 * as elapsed working days.
 *
 * Behaviour:
 *  - Step-1 timeout: status='submitted' AND submitted_at older than
 *    `addWorkingDays(now, -2, {holidays})` → cancel with reason
 *    `auto_cancel_no_branch_approval`. No reservations to release
 *    (none were ever made — that happens at step 1).
 *  - Step-2 timeout: status='branch_approved' AND branch_approved_at
 *    older than `addWorkingDays(now, -3, {holidays})` → cancel with
 *    reason `auto_cancel_no_hq_approval`. Releases reservations via
 *    the same movement+inventory pattern as the manual cancel action.
 *
 * Auth: production sets `CRON_SECRET`; Vercel Cron sends the matching
 * Bearer header automatically. Local + e2e leave the secret unset so
 * the route is callable directly. The DST gate is also production-only
 * so e2e tests can hit the cron at any clock time.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StaleOrder = {
  id: string;
  order_number: string;
  branch_id: string;
  created_by_user_id: string;
  branch_approved_by_user_id: string | null;
  status: "submitted" | "branch_approved";
  submitted_at: string | null;
  branch_approved_at: string | null;
};

const REASON_BY_PRIOR: Record<
  "submitted" | "branch_approved",
  "auto_cancel_no_branch_approval" | "auto_cancel_no_hq_approval"
> = {
  submitted: "auto_cancel_no_branch_approval",
  branch_approved: "auto_cancel_no_hq_approval",
};

const STEP_1_DAYS = 2;
const STEP_2_DAYS = 3;
const TARGET_AMS_HOUR = 8;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // DST gate — production-only so e2e tests can hit the cron at any
  // clock time. The `secret` presence is the production signal we
  // already use for auth above.
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
  const now = new Date();
  const holidays = await loadActiveHolidays(adm);
  const step1Cutoff = addWorkingDays(now, -STEP_1_DAYS, { holidays });
  const step2Cutoff = addWorkingDays(now, -STEP_2_DAYS, { holidays });

  const stale = await loadStaleOrders(adm, step1Cutoff, step2Cutoff);

  let cancelled = 0;
  let reservationsReleased = 0;
  for (const order of stale) {
    const ok = await cancelOne(adm, order);
    if (!ok) continue;
    cancelled += 1;
    if (order.status === "branch_approved") reservationsReleased += 1;
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    step1_cutoff: step1Cutoff.toISOString(),
    step2_cutoff: step2Cutoff.toISOString(),
    candidates: stale.length,
    cancelled,
    reservations_released: reservationsReleased,
  });
}

async function loadStaleOrders(
  adm: SupabaseClient<Database>,
  step1Cutoff: Date,
  step2Cutoff: Date,
): Promise<StaleOrder[]> {
  // Two queries, one per source state. Keeps the WHERE clauses
  // unambiguous (each cutoff is a different column) and makes the
  // result set easy to reason about.
  const [s1, s2] = await Promise.all([
    adm
      .from("orders")
      .select(
        "id, order_number, branch_id, created_by_user_id, branch_approved_by_user_id, status, submitted_at, branch_approved_at",
      )
      .eq("status", "submitted")
      .lt("submitted_at", step1Cutoff.toISOString())
      .is("deleted_at", null)
      .order("submitted_at", { ascending: true })
      .limit(500),
    adm
      .from("orders")
      .select(
        "id, order_number, branch_id, created_by_user_id, branch_approved_by_user_id, status, submitted_at, branch_approved_at",
      )
      .eq("status", "branch_approved")
      .lt("branch_approved_at", step2Cutoff.toISOString())
      .is("deleted_at", null)
      .order("branch_approved_at", { ascending: true })
      .limit(500),
  ]);
  return [
    ...((s1.data ?? []) as StaleOrder[]),
    ...((s2.data ?? []) as StaleOrder[]),
  ];
}

async function cancelOne(
  adm: SupabaseClient<Database>,
  order: StaleOrder,
): Promise<boolean> {
  const reason = REASON_BY_PRIOR[order.status];

  // Release reservations BEFORE flipping status — same ordering the
  // manual cancel action uses, so audit + inventory stay coherent if
  // the status flip races with another writer.
  if (order.status === "branch_approved") {
    await releaseReservationsFor(adm, order.id);
  }

  const { data: head, error: headErr } = await adm
    .from("orders")
    .update({
      status: "cancelled",
      notes: `Auto-cancelled by cron — ${reason}`,
    })
    .eq("id", order.id)
    .eq("status", order.status) // status guard — racing manual action wins
    .select("id");
  if (headErr) {
    // eslint-disable-next-line no-console
    console.error(
      `[cron:auto-cancel] update failed for ${order.order_number}: ${headErr.message}`,
    );
    return false;
  }
  if (!head || head.length === 0) {
    // Status changed under us — someone approved/rejected manually
    // between our SELECT and UPDATE. Skip silently; not an error.
    return false;
  }

  await adm.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: reason,
    actor_user_id: null, // system actor — cron has no user
    before_json: { status: order.status } as Json,
    after_json: {
      status: "cancelled",
      reason,
      cron: "auto-cancel-stale-orders",
    } as unknown as Json,
  });

  // Side effect: per SPEC §8.8, the auto-cancel email goes to:
  //   step 1 timeout → creator + branch managers
  //   step 2 timeout → creator + branch manager who approved step 1 +
  //                    HQ Managers + administration
  // A single template (`renderOrderAutoCancelled`) covers both — the
  // `step` discriminator drives the subject + body framing.
  await emitAutoCancelNotifications(adm, order);
  return true;
}

async function emitAutoCancelNotifications(
  adm: SupabaseClient<Database>,
  order: StaleOrder,
): Promise<void> {
  try {
    const { data: branch } = await adm
      .from("branches")
      .select("branch_code, name")
      .eq("id", order.branch_id)
      .maybeSingle();
    const branchCode = branch?.branch_code ?? "—";
    const branchName = branch?.name ?? "—";

    const step: "branch" | "hq" =
      order.status === "submitted" ? "branch" : "hq";
    const waitedDays = step === "branch" ? STEP_1_DAYS : STEP_2_DAYS;

    const recipients: Recipient[] = [];
    const seen = new Set<string>();
    const push = (rs: Array<Recipient | null>) => {
      for (const r of rs) {
        if (!r || seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        recipients.push(r);
      }
    };

    push([await userById(adm, order.created_by_user_id)]);
    push(await managersForBranch(adm, order.branch_id));
    if (step === "hq") {
      if (order.branch_approved_by_user_id) {
        push([await userById(adm, order.branch_approved_by_user_id)]);
      }
      push(await hqManagers(adm));
      push(await adminAudience(adm));
    }
    if (recipients.length === 0) return;

    const rendered = renderOrderAutoCancelled({
      order_id: order.id,
      order_number: order.order_number,
      branch_code: branchCode,
      branch_name: branchName,
      step,
      waited_days: waitedDays,
    });
    await notify({
      db: adm,
      type: "order_auto_cancelled",
      recipients,
      rendered,
      payload: {
        order_id: order.id,
        order_number: order.order_number,
        branch_code: branchCode,
        step,
        waited_days: waitedDays,
        href: `/orders/${order.id}`,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] order_auto_cancelled failed for ${order.id}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Mirrors `releaseReservationsFor` in `src/lib/actions/approval.ts` —
 * deliberately duplicated rather than imported because that helper is
 * server-action-internal (not exported) and the cron route uses a
 * different actor model (no `auth.uid()`).
 */
async function releaseReservationsFor(
  adm: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const { data: items } = await adm
    .from("order_items")
    .select("product_id, quantity_approved")
    .eq("order_id", orderId);
  const rows = (items ?? []).filter(
    (it): it is { product_id: string; quantity_approved: number } =>
      typeof it.quantity_approved === "number" && it.quantity_approved > 0,
  );
  if (rows.length === 0) return;

  const movements = rows.map((r) => ({
    product_id: r.product_id,
    delta: r.quantity_approved,
    reason: "order_released" as const,
    reference_type: "order",
    reference_id: orderId,
    actor_user_id: null,
  }));
  await adm.from("inventory_movements").insert(movements);

  const { data: invRows } = await adm
    .from("inventory")
    .select("product_id, quantity_reserved")
    .in("product_id", Array.from(new Set(rows.map((r) => r.product_id))));
  const current = new Map(
    (invRows ?? []).map((r) => [r.product_id, r.quantity_reserved]),
  );
  for (const r of rows) {
    const prior = current.get(r.product_id) ?? 0;
    const next = Math.max(0, prior - r.quantity_approved);
    await adm
      .from("inventory")
      .update({ quantity_reserved: next })
      .eq("product_id", r.product_id);
    current.set(r.product_id, next);
  }
}
