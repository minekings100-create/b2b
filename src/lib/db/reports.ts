import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phase 7b-2c — read-only aggregation helpers for the Reports section.
 *
 * Uses the admin (service-role) client because every report is a
 * cross-branch aggregate and the callers are already admin-gated at
 * the page/route layer. The page-level `canSeeReport()` check is the
 * security boundary; RLS isn't useful here (most reports span every
 * branch regardless of who's asking).
 *
 * All monetary values are bigint cents — pulled raw and formatted at
 * the rendering layer via `formatCents`.
 *
 * Windows: pages pass ISO date strings (YYYY-MM-DD). Helpers treat
 * `from` as inclusive 00:00:00Z and `to` as inclusive 23:59:59Z.
 */

export type DateWindow = { from: string; to: string };

function windowIsoRange(w: DateWindow): { fromIso: string; toIso: string } {
  return {
    fromIso: `${w.from}T00:00:00.000Z`,
    toIso: `${w.to}T23:59:59.999Z`,
  };
}

// ---------- Spend by branch ------------------------------------------------

export type SpendByBranchRow = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  invoice_count: number;
  total_gross_cents: number;
};

/**
 * Sum of `total_gross_cents` on invoices with status in
 * ('issued','paid','overdue') whose `issued_at` falls in the window.
 * Drafts + cancelled excluded — they're not real spend.
 */
export async function fetchSpendByBranch(
  w: DateWindow,
): Promise<SpendByBranchRow[]> {
  const db = createAdminClient();
  const { fromIso, toIso } = windowIsoRange(w);

  const { data, error } = await db
    .from("invoices")
    .select(
      "branch_id, total_gross_cents, branches!inner(branch_code, name)",
    )
    .in("status", ["issued", "paid", "overdue"])
    .gte("issued_at", fromIso)
    .lte("issued_at", toIso)
    .is("deleted_at", null);
  if (error) throw error;

  type Row = {
    branch_id: string;
    total_gross_cents: number;
    branches: { branch_code: string; name: string };
  };
  const byBranch = new Map<string, SpendByBranchRow>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const existing = byBranch.get(r.branch_id);
    if (existing) {
      existing.invoice_count += 1;
      existing.total_gross_cents += r.total_gross_cents;
    } else {
      byBranch.set(r.branch_id, {
        branch_id: r.branch_id,
        branch_code: r.branches.branch_code,
        branch_name: r.branches.name,
        invoice_count: 1,
        total_gross_cents: r.total_gross_cents,
      });
    }
  }
  return Array.from(byBranch.values()).sort(
    (a, b) => b.total_gross_cents - a.total_gross_cents,
  );
}

// ---------- Top products --------------------------------------------------

export type TopProductRow = {
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  line_net_cents: number;
};

/**
 * Sum of `line_net_cents` + quantity on order_items whose parent order
 * is past branch-approval (i.e. the branch-level commit is real). We
 * include every status from `branch_approved` onward; draft/submitted
 * are requests, not actual spend.
 */
export async function fetchTopProducts(
  w: DateWindow,
  limit: number = 25,
): Promise<TopProductRow[]> {
  const db = createAdminClient();
  const { fromIso, toIso } = windowIsoRange(w);

  const { data, error } = await db
    .from("order_items")
    .select(
      `product_id, quantity_approved, quantity_requested, line_net_cents,
       products!inner(sku, name),
       orders!inner(status, branch_approved_at)`,
    )
    .in("orders.status", [
      "branch_approved",
      "approved",
      "picking",
      "packed",
      "shipped",
      "delivered",
      "closed",
    ])
    .gte("orders.branch_approved_at", fromIso)
    .lte("orders.branch_approved_at", toIso);
  if (error) throw error;

  type Row = {
    product_id: string;
    quantity_approved: number | null;
    quantity_requested: number;
    line_net_cents: number;
    products: { sku: string; name: string };
  };

  const byProduct = new Map<string, TopProductRow>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const qty = r.quantity_approved ?? r.quantity_requested;
    const existing = byProduct.get(r.product_id);
    if (existing) {
      existing.quantity += qty;
      existing.line_net_cents += r.line_net_cents;
    } else {
      byProduct.set(r.product_id, {
        product_id: r.product_id,
        sku: r.products.sku,
        name: r.products.name,
        quantity: qty,
        line_net_cents: r.line_net_cents,
      });
    }
  }
  return Array.from(byProduct.values())
    .sort((a, b) => b.line_net_cents - a.line_net_cents)
    .slice(0, limit);
}

// ---------- AR aging -------------------------------------------------------

export type ArAgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export type ArAgingRow = {
  invoice_id: string;
  invoice_number: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  total_gross_cents: number;
  due_at: string;
  days_overdue: number;
  bucket: ArAgingBucket;
};

export type ArAgingSummary = {
  rows: ArAgingRow[];
  totals_by_bucket: Record<ArAgingBucket, number>;
};

/**
 * Every unpaid (issued / overdue) invoice, with days-overdue computed
 * against `now` and bucketed. Drafts excluded — they haven't been
 * billed yet. Paid + cancelled excluded — they aren't receivable.
 */
export async function fetchArAging(
  nowIso: string = new Date().toISOString(),
): Promise<ArAgingSummary> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("invoices")
    .select(
      "id, invoice_number, branch_id, total_gross_cents, due_at, branches!inner(branch_code, name)",
    )
    .in("status", ["issued", "overdue"])
    .is("deleted_at", null);
  if (error) throw error;

  const now = new Date(nowIso).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  type Row = {
    id: string;
    invoice_number: string;
    branch_id: string;
    total_gross_cents: number;
    due_at: string | null;
    branches: { branch_code: string; name: string };
  };
  const rows: ArAgingRow[] = [];
  const totals: Record<ArAgingBucket, number> = {
    current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.due_at) continue;
    const days = Math.floor((now - new Date(r.due_at).getTime()) / DAY_MS);
    const bucket: ArAgingBucket =
      days <= 0
        ? "current"
        : days <= 30
          ? "1-30"
          : days <= 60
            ? "31-60"
            : days <= 90
              ? "61-90"
              : "90+";
    totals[bucket] += r.total_gross_cents;
    rows.push({
      invoice_id: r.id,
      invoice_number: r.invoice_number,
      branch_id: r.branch_id,
      branch_code: r.branches.branch_code,
      branch_name: r.branches.name,
      total_gross_cents: r.total_gross_cents,
      due_at: r.due_at,
      days_overdue: Math.max(0, days),
      bucket,
    });
  }
  rows.sort((a, b) => b.days_overdue - a.days_overdue);
  return { rows, totals_by_bucket: totals };
}

// ---------- Packer throughput ---------------------------------------------

export type PackerThroughputRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  pallet_count: number;
  order_count: number;
};

/**
 * Pallets with `packed_at` in window, grouped by `packed_by_user_id`.
 * System-packed pallets (no user) are grouped under a single
 * "(system)" row with user_id = null.
 */
export async function fetchPackerThroughput(
  w: DateWindow,
): Promise<PackerThroughputRow[]> {
  const db = createAdminClient();
  const { fromIso, toIso } = windowIsoRange(w);

  const { data, error } = await db
    .from("pallets")
    .select("packed_by_user_id, order_id")
    .gte("packed_at", fromIso)
    .lte("packed_at", toIso)
    .is("deleted_at", null)
    .not("packed_at", "is", null);
  if (error) throw error;

  type Row = { packed_by_user_id: string | null; order_id: string };
  const by = new Map<
    string,
    { pallet_count: number; order_ids: Set<string> }
  >();
  for (const r of (data ?? []) as Row[]) {
    const key = r.packed_by_user_id ?? "__system__";
    const existing = by.get(key);
    if (existing) {
      existing.pallet_count += 1;
      existing.order_ids.add(r.order_id);
    } else {
      by.set(key, { pallet_count: 1, order_ids: new Set([r.order_id]) });
    }
  }

  const realIds = Array.from(by.keys()).filter((k) => k !== "__system__");
  const userMap = new Map<
    string,
    { email: string; full_name: string | null }
  >();
  if (realIds.length > 0) {
    const { data: users } = await db
      .from("users")
      .select("id, email, full_name")
      .in("id", realIds);
    for (const u of users ?? []) {
      userMap.set(u.id, { email: u.email, full_name: u.full_name });
    }
  }

  const rows: PackerThroughputRow[] = [];
  for (const [key, v] of by) {
    if (key === "__system__") {
      rows.push({
        user_id: "__system__",
        email: "(system)",
        full_name: null,
        pallet_count: v.pallet_count,
        order_count: v.order_ids.size,
      });
    } else {
      const u = userMap.get(key);
      rows.push({
        user_id: key,
        email: u?.email ?? "(deleted user)",
        full_name: u?.full_name ?? null,
        pallet_count: v.pallet_count,
        order_count: v.order_ids.size,
      });
    }
  }
  return rows.sort((a, b) => b.pallet_count - a.pallet_count);
}
