import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amsterdamHourNow,
  isExpectedAmsterdamHour,
} from "@/lib/dates/dst-cron";
import {
  hqManagers,
  managersForBranch,
  type Recipient,
} from "@/lib/email/recipients";
import { notify } from "@/lib/email/notify";
import {
  renderAwaitingApprovalReminder,
  renderAwaitingHqApprovalReminder,
} from "@/lib/email/templates";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Sub-milestone 3.3.1, post-3.2.2 rebase — nightly digest reminder for
 * BOTH approval steps.
 *
 * Schedule: 02:15 Europe/Amsterdam, year-round. `vercel.json` ships TWO
 * UTC schedules to handle DST: `15 0 * * *` matches 02:15 CEST (summer)
 * and `15 1 * * *` matches 02:15 CET (winter). The DST gate at the top
 * of GET (production only) suppresses the off-half firing. Phase 7b-1.
 *
 * Two passes per run:
 *   1. submitted_awaiting_branch_reminder — orders where
 *      status='submitted' AND submitted_at < now() - 24h.
 *      Grouped by branch; one digest per branch_manager.
 *   2. branch_approved_awaiting_hq_reminder — orders where
 *      status='branch_approved' AND branch_approved_at < now() - 24h.
 *      Cross-branch; one digest per HQ Manager.
 *
 * Both digests are emitted by the same cron tick so a single Vercel
 * Cron event handles both queues in one transaction-of-intent.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TARGET_AMS_HOUR = 2;

type WaitingOrder = {
  order_id: string;
  order_number: string;
  branch_id: string;
  branch_code: string;
  submitted_at: string;
  branch_approved_at: string | null;
  item_count: number;
  total_gross_cents: number;
};

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // DST gate — production-only so e2e can hit the cron at any time.
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
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const branchResult = await emitStep1Digests(adm, cutoffIso);
  const hqResult = await emitStep2Digests(adm, cutoffIso);

  return NextResponse.json({
    ok: true,
    branch: branchResult,
    hq: hqResult,
    // Top-level totals preserved for backwards-compat with the existing
    // 3.3.1 e2e (`branches` / `digests` / `waiting_total`).
    branches: branchResult.branches,
    digests: branchResult.digests + hqResult.digests,
    waiting_total: branchResult.waiting_total + hqResult.waiting_total,
  });
}

async function loadWaiting(
  adm: SupabaseClient<Database>,
  status: "submitted" | "branch_approved",
  cutoffColumn: "submitted_at" | "branch_approved_at",
  cutoffIso: string,
): Promise<WaitingOrder[]> {
  const { data, error } = await adm
    .from("orders")
    .select(
      `id, order_number, branch_id, submitted_at, branch_approved_at, total_gross_cents,
       branches ( branch_code ),
       order_items ( count )`,
    )
    .eq("status", status)
    .lt(cutoffColumn, cutoffIso)
    .is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string;
    order_number: string;
    branch_id: string;
    submitted_at: string | null;
    branch_approved_at: string | null;
    total_gross_cents: number;
    branches: { branch_code: string } | { branch_code: string }[] | null;
    order_items: { count: number }[] | null;
  }>).map((o) => {
    const branch = Array.isArray(o.branches) ? o.branches[0] : o.branches;
    return {
      order_id: o.id,
      order_number: o.order_number,
      branch_id: o.branch_id,
      branch_code: branch?.branch_code ?? "—",
      submitted_at: o.submitted_at as string,
      branch_approved_at: o.branch_approved_at,
      item_count: o.order_items?.[0]?.count ?? 0,
      total_gross_cents: o.total_gross_cents,
    };
  });
}

async function emitStep1Digests(
  adm: SupabaseClient<Database>,
  cutoffIso: string,
): Promise<{ branches: number; digests: number; waiting_total: number }> {
  const waiting = await loadWaiting(adm, "submitted", "submitted_at", cutoffIso);
  if (waiting.length === 0) return { branches: 0, digests: 0, waiting_total: 0 };

  const byBranch = new Map<string, WaitingOrder[]>();
  for (const w of waiting) {
    const arr = byBranch.get(w.branch_id) ?? [];
    arr.push(w);
    byBranch.set(w.branch_id, arr);
  }

  const { data: branchRows } = await adm
    .from("branches")
    .select("id, branch_code, name")
    .in("id", Array.from(byBranch.keys()));
  const branchById = new Map((branchRows ?? []).map((b) => [b.id, b]));

  let digests = 0;
  for (const [branchId, branchOrders] of byBranch) {
    const branch = branchById.get(branchId);
    const branchCode = branch?.branch_code ?? "—";
    const branchName = branch?.name ?? "—";
    const managers = await managersForBranch(adm, branchId);
    if (managers.length === 0) continue;

    branchOrders.sort((a, b) =>
      a.submitted_at.localeCompare(b.submitted_at),
    );

    for (const manager of managers as Recipient[]) {
      const rendered = renderAwaitingApprovalReminder({
        branch_code: branchCode,
        branch_name: branchName,
        manager_email: manager.email,
        orders: branchOrders,
      });
      await notify({
        db: adm,
        type: "submitted_awaiting_branch_reminder",
        recipients: [manager],
        rendered,
        payload: {
          branch_id: branchId,
          branch_code: branchCode,
          waiting_count: branchOrders.length,
          waiting_order_ids: branchOrders.map((o) => o.order_id),
          href: `/approvals`,
        },
      });
      digests += 1;
    }
  }
  return { branches: byBranch.size, digests, waiting_total: waiting.length };
}

async function emitStep2Digests(
  adm: SupabaseClient<Database>,
  cutoffIso: string,
): Promise<{ branches: number; digests: number; waiting_total: number }> {
  const waiting = await loadWaiting(
    adm,
    "branch_approved",
    "branch_approved_at",
    cutoffIso,
  );
  if (waiting.length === 0) return { branches: 0, digests: 0, waiting_total: 0 };

  // Step-2 audience is HQ Managers (cross-branch — they own this queue).
  const recipients = await hqManagers(adm);
  if (recipients.length === 0) {
    return { branches: 0, digests: 0, waiting_total: waiting.length };
  }

  // Sort by branch_approved_at — oldest first.
  waiting.sort((a, b) =>
    (a.branch_approved_at ?? "").localeCompare(b.branch_approved_at ?? ""),
  );

  let digests = 0;
  for (const manager of recipients) {
    const rendered = renderAwaitingHqApprovalReminder({
      manager_email: manager.email,
      orders: waiting.map((w) => ({
        order_id: w.order_id,
        order_number: w.order_number,
        branch_code: w.branch_code,
        branch_approved_at: w.branch_approved_at as string,
        item_count: w.item_count,
        total_gross_cents: w.total_gross_cents,
      })),
    });
    await notify({
      db: adm,
      type: "branch_approved_awaiting_hq_reminder",
      recipients: [manager],
      rendered,
      payload: {
        waiting_count: waiting.length,
        waiting_order_ids: waiting.map((o) => o.order_id),
        href: `/approvals`,
      },
    });
    digests += 1;
  }
  // `branches` here counts the unique branches surfaced in the HQ digest,
  // which gives a useful cross-branch breadth metric.
  const branches = new Set(waiting.map((w) => w.branch_id)).size;
  return { branches, digests, waiting_total: waiting.length };
}
