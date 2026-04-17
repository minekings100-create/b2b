import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { daysBefore, pad, pickMany, pickOne, seedRand } from "./util";

type AdminClient = SupabaseClient<Database>;

export type OrderStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "picking"
  | "packed"
  | "shipped"
  | "delivered"
  | "closed"
  | "cancelled";

/**
 * What we generate and hand back to downstream modules. Pallets, shipments,
 * invoices, returns, movements and audit all depend on this.
 */
export type SeededOrder = {
  id: string;
  order_number: string;
  branch_id: string;
  branch_code: string;
  created_by_user_id: string;
  status: OrderStatus;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  items: SeededOrderItem[];
};

export type SeededOrderItem = {
  id: string;
  product_id: string;
  category_name: string;
  quantity_requested: number;
  quantity_approved: number | null;
  quantity_packed: number;
  quantity_shipped: number;
  unit_price_cents_snapshot: number;
  vat_rate_snapshot: number;
  line_net_cents: number;
};

type BranchRow = { id: string; branch_code: string };
type UserRow = { id: string; email: string; full_name: string | null };
type ProductRow = {
  id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  vat_rate: number;
  category_id: string | null;
};
type CategoryRow = { id: string; name: string };

/**
 * Status distribution. Tweak counts here to change the demo shape.
 */
const DISTRIBUTION: Array<{ status: OrderStatus; count: number; sizePattern: ("small" | "large")[] }> = [
  { status: "draft",     count: 3, sizePattern: ["small", "small", "large"] },
  { status: "submitted", count: 3, sizePattern: ["small", "large", "small"] },
  { status: "approved",  count: 3, sizePattern: ["large", "small", "large"] },
  { status: "rejected",  count: 2, sizePattern: ["small", "large"] },
  { status: "picking",   count: 2, sizePattern: ["small", "large"] },
  { status: "packed",    count: 3, sizePattern: ["small", "large", "small"] },
  { status: "shipped",   count: 3, sizePattern: ["large", "small", "large"] },
  { status: "delivered", count: 3, sizePattern: ["small", "large", "small"] },
  { status: "closed",    count: 2, sizePattern: ["small", "large"] },
  { status: "cancelled", count: 2, sizePattern: ["small", "small"] },
];

export async function seedOrders(
  supabase: AdminClient,
  now: Date,
): Promise<SeededOrder[]> {
  console.log("→ seeding orders");

  const [{ data: branches }, { data: users }, { data: products }, { data: categories }] =
    await Promise.all([
      supabase.from("branches").select("id, branch_code"),
      supabase.from("users").select("id, email, full_name"),
      supabase
        .from("products")
        .select("id, sku, name, unit_price_cents, vat_rate, category_id"),
      supabase.from("product_categories").select("id, name"),
    ]);

  if (!branches || !users || !products || !categories) {
    throw new Error("Missing base seed (branches/users/products/categories)");
  }

  // Index helpers.
  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const productsByCategory = new Map<string, ProductRow[]>();
  for (const p of products as ProductRow[]) {
    if (!p.category_id) continue;
    const list = productsByCategory.get(p.category_id) ?? [];
    list.push(p);
    productsByCategory.set(p.category_id, list);
  }

  // Branch users + managers, keyed by branch_code.
  const branchUsersByCode = new Map<string, UserRow[]>();
  const branchManagerByCode = new Map<string, UserRow>();
  const packerUsers: UserRow[] = [];
  const administrationUsers: UserRow[] = [];

  const { data: roles } = await supabase
    .from("user_branch_roles")
    .select("user_id, branch_id, role");
  if (!roles) throw new Error("No user_branch_roles found — run Phase 1 seed first.");

  const userById = new Map((users as UserRow[]).map((u) => [u.id, u]));
  const branchCodeById = new Map((branches as BranchRow[]).map((b) => [b.id, b.branch_code]));

  for (const r of roles) {
    const user = userById.get(r.user_id);
    if (!user) continue;
    if (r.role === "packer") packerUsers.push(user);
    else if (r.role === "administration") administrationUsers.push(user);
    else if (r.branch_id) {
      const code = branchCodeById.get(r.branch_id);
      if (!code) continue;
      if (r.role === "branch_user") {
        const list = branchUsersByCode.get(code) ?? [];
        list.push(user);
        branchUsersByCode.set(code, list);
      } else if (r.role === "branch_manager") {
        branchManagerByCode.set(code, user);
      }
    }
  }

  const rand = seedRand(7);
  const branchCodes = (branches as BranchRow[]).map((b) => b.branch_code);
  const categoryList = categories as CategoryRow[];

  // Pick a primary category per order and draw most items from it for
  // realistic combos (cleaning orders stock cleaning; POS orders stock POS).
  const buildItems = (
    size: "small" | "large",
  ): Array<Omit<SeededOrderItem, "id">> => {
    const primary = pickOne(rand, categoryList);
    const secondary = pickOne(rand, categoryList);
    const targetCount = size === "small" ? 3 + Math.floor(rand() * 3) : 15 + Math.floor(rand() * 11);
    const primaryPool = productsByCategory.get(primary.id) ?? [];
    const secondaryPool = productsByCategory.get(secondary.id) ?? [];
    const primaryPicks = pickMany(rand, primaryPool, Math.max(1, Math.floor(targetCount * 0.75)));
    const secondaryPicks = pickMany(
      rand,
      secondaryPool,
      Math.max(0, targetCount - primaryPicks.length),
    );
    const picks = [...primaryPicks, ...secondaryPicks].slice(0, targetCount);
    return picks.map((p) => {
      const qty = 1 + Math.floor(rand() * 24);
      return {
        product_id: p.id,
        category_name: categoryById.get(p.category_id!) ?? "—",
        quantity_requested: qty,
        quantity_approved: qty,
        quantity_packed: 0,
        quantity_shipped: 0,
        unit_price_cents_snapshot: p.unit_price_cents,
        vat_rate_snapshot: p.vat_rate,
        line_net_cents: qty * p.unit_price_cents,
      };
    });
  };

  const rows: Array<{
    order_number: string;
    branch_id: string;
    created_by_user_id: string;
    status: OrderStatus;
    submitted_at: string | null;
    approved_at: string | null;
    approved_by_user_id: string | null;
    rejection_reason: string | null;
    total_net_cents: number;
    total_vat_cents: number;
    total_gross_cents: number;
    notes: string | null;
    created_at: string;
    branch_code: string;
    items: Array<Omit<SeededOrderItem, "id">>;
  }> = [];

  let counter = 1;
  let branchCursor = 0;
  for (const bucket of DISTRIBUTION) {
    for (let i = 0; i < bucket.count; i++) {
      const size = bucket.sizePattern[i % bucket.sizePattern.length]!;
      const branchCode = branchCodes[branchCursor++ % branchCodes.length]!;
      const branch = (branches as BranchRow[]).find((b) => b.branch_code === branchCode)!;
      const branchUsers = branchUsersByCode.get(branchCode);
      if (!branchUsers || branchUsers.length === 0) {
        // Fallback to a manager — every branch has one.
        const mgr = branchManagerByCode.get(branchCode);
        if (!mgr) throw new Error(`No users for branch ${branchCode}`);
        branchUsers && branchUsers.push(mgr);
      }
      const creator = pickOne(rand, branchUsersByCode.get(branchCode) ?? []);
      const items = buildItems(size);

      // Totals — VAT computed per line, not at header, to handle mixed rates.
      let net = 0;
      let vat = 0;
      for (const item of items) {
        net += item.line_net_cents;
        vat += Math.round((item.line_net_cents * item.vat_rate_snapshot) / 100);
      }

      // Timeline. `baseAgeDays` is how long ago the order was created.
      const baseAgeDays = 2 + Math.floor(rand() * 42);
      const createdAt = daysBefore(now, baseAgeDays);
      let submittedAt: string | null = null;
      let approvedAt: string | null = null;
      let approvedBy: string | null = null;
      let rejectionReason: string | null = null;

      if (bucket.status !== "draft") {
        submittedAt = daysBefore(now, Math.max(0, baseAgeDays - 1));
      }
      if (
        bucket.status === "approved" ||
        bucket.status === "picking" ||
        bucket.status === "packed" ||
        bucket.status === "shipped" ||
        bucket.status === "delivered" ||
        bucket.status === "closed"
      ) {
        approvedAt = daysBefore(now, Math.max(0, baseAgeDays - 2));
        approvedBy = branchManagerByCode.get(branchCode)?.id ?? null;
      }
      if (bucket.status === "rejected") {
        rejectionReason = pickOne(rand, [
          "Over monthly budget — please resubmit next month.",
          "Duplicate of ORD previously submitted.",
          "Quantities unrealistic for branch — cut by half and resubmit.",
        ]);
        approvedBy = branchManagerByCode.get(branchCode)?.id ?? null;
      }

      // For anything beyond 'approved', adjust quantity_packed / shipped.
      if (
        bucket.status === "packed" ||
        bucket.status === "shipped" ||
        bucket.status === "delivered" ||
        bucket.status === "closed"
      ) {
        for (const it of items) {
          it.quantity_packed = it.quantity_approved ?? it.quantity_requested;
        }
      }
      if (
        bucket.status === "shipped" ||
        bucket.status === "delivered" ||
        bucket.status === "closed"
      ) {
        for (const it of items) {
          it.quantity_shipped = it.quantity_approved ?? it.quantity_requested;
        }
      }

      // Cancelled orders keep the approved totals but flag a note.
      const notes =
        bucket.status === "cancelled"
          ? "Cancelled by branch — duplicate request."
          : null;

      rows.push({
        order_number: `DEMO-ORD-${pad(counter, 4)}`,
        branch_id: branch.id,
        created_by_user_id: creator.id,
        status: bucket.status,
        submitted_at: submittedAt,
        approved_at: approvedAt,
        approved_by_user_id: approvedBy,
        rejection_reason: rejectionReason,
        total_net_cents: net,
        total_vat_cents: vat,
        total_gross_cents: net + vat,
        notes,
        created_at: createdAt,
        branch_code: branchCode,
        items,
      });
      counter += 1;
    }
  }

  // Insert orders first to obtain UUIDs.
  const headerInserts = rows.map((r) => ({
    order_number: r.order_number,
    branch_id: r.branch_id,
    created_by_user_id: r.created_by_user_id,
    status: r.status,
    submitted_at: r.submitted_at,
    approved_at: r.approved_at,
    approved_by_user_id: r.approved_by_user_id,
    rejection_reason: r.rejection_reason,
    total_net_cents: r.total_net_cents,
    total_vat_cents: r.total_vat_cents,
    total_gross_cents: r.total_gross_cents,
    notes: r.notes,
    created_at: r.created_at,
  }));

  const { data: insertedHeaders, error: hdrErr } = await supabase
    .from("orders")
    .insert(headerInserts)
    .select("id, order_number");
  if (hdrErr) throw hdrErr;
  const idByNumber = new Map(
    (insertedHeaders ?? []).map((o) => [o.order_number, o.id]),
  );

  // Now insert items in one large chunk.
  const itemInserts: Array<{
    order_id: string;
    product_id: string;
    quantity_requested: number;
    quantity_approved: number | null;
    quantity_packed: number;
    quantity_shipped: number;
    unit_price_cents_snapshot: number;
    vat_rate_snapshot: number;
    line_net_cents: number;
  }> = [];
  for (const r of rows) {
    const orderId = idByNumber.get(r.order_number)!;
    for (const it of r.items) {
      itemInserts.push({
        order_id: orderId,
        product_id: it.product_id,
        quantity_requested: it.quantity_requested,
        quantity_approved: it.quantity_approved,
        quantity_packed: it.quantity_packed,
        quantity_shipped: it.quantity_shipped,
        unit_price_cents_snapshot: it.unit_price_cents_snapshot,
        vat_rate_snapshot: it.vat_rate_snapshot,
        line_net_cents: it.line_net_cents,
      });
    }
  }

  const insertedItemIds: Array<{ id: string; order_id: string; product_id: string }> = [];
  for (let i = 0; i < itemInserts.length; i += 200) {
    const chunk = itemInserts.slice(i, i + 200);
    const { data, error } = await supabase
      .from("order_items")
      .insert(chunk)
      .select("id, order_id, product_id");
    if (error) throw error;
    insertedItemIds.push(...(data ?? []));
  }

  // Stitch back to SeededOrder[]. Iterate the original `rows` in order so we
  // can match inserted items positionally within each order.
  const itemsByOrder = new Map<string, Array<{ id: string; product_id: string }>>();
  for (const row of insertedItemIds) {
    const list = itemsByOrder.get(row.order_id) ?? [];
    list.push({ id: row.id, product_id: row.product_id });
    itemsByOrder.set(row.order_id, list);
  }

  const out: SeededOrder[] = [];
  for (const r of rows) {
    const orderId = idByNumber.get(r.order_number)!;
    const insertedList = itemsByOrder.get(orderId) ?? [];
    // Match by product_id + sequence: item sets per order may have duplicates
    // of the same product (unlikely but possible). Pair positionally through
    // a copy of the inserted list.
    const remaining = [...insertedList];
    const items: SeededOrderItem[] = r.items.map((it) => {
      const matchIdx = remaining.findIndex((ri) => ri.product_id === it.product_id);
      const match = matchIdx >= 0 ? remaining.splice(matchIdx, 1)[0]! : remaining.shift();
      if (!match) throw new Error(`Missing inserted row for ${r.order_number}`);
      return { ...it, id: match.id };
    });

    out.push({
      id: orderId,
      order_number: r.order_number,
      branch_id: r.branch_id,
      branch_code: r.branch_code,
      created_by_user_id: r.created_by_user_id,
      status: r.status,
      created_at: r.created_at,
      submitted_at: r.submitted_at,
      approved_at: r.approved_at,
      approved_by_user_id: r.approved_by_user_id,
      total_net_cents: r.total_net_cents,
      total_vat_cents: r.total_vat_cents,
      total_gross_cents: r.total_gross_cents,
      items,
    });
  }

  console.log(`  inserted ${out.length} orders (${itemInserts.length} line items)`);
  return out;
}

export function pickPackerUsers(
  roles: Array<{ user_id: string; role: string; branch_id: string | null }>,
  users: Array<{ id: string; email: string }>,
): Array<{ id: string; email: string }> {
  const packerIds = new Set(roles.filter((r) => r.role === "packer").map((r) => r.user_id));
  return users.filter((u) => packerIds.has(u.id));
}

export function pickAdminUsers(
  roles: Array<{ user_id: string; role: string; branch_id: string | null }>,
  users: Array<{ id: string; email: string }>,
): Array<{ id: string; email: string }> {
  const adminIds = new Set(
    roles
      .filter((r) => r.role === "administration" || r.role === "super_admin")
      .map((r) => r.user_id),
  );
  return users.filter((u) => adminIds.has(u.id));
}
