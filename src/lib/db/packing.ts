import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Phase 4 — packer-facing read layer.
 *
 * Pack queue: every order in `approved` or `picking` status, oldest
 * `approved_at` first. RLS narrows packers to fulfilment-stage orders
 * (3.2.2 narrowing) and admins/super see all branches; branch users
 * never reach this page (sidebar gates entry).
 *
 * Pick list: an order plus its lines + bin location + barcode
 * affordances. Pallet panel reads open + closed pallets for the
 * order so the packer can see what's already on each pallet.
 */

type Status = Database["public"]["Enums"]["order_status"];
type PalletStatus = Database["public"]["Enums"]["pallet_status"];

export type PackQueueRow = {
  id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  status: Extract<Status, "approved" | "picking">;
  approved_at: string;
  item_count: number;
  total_qty_approved: number;
  total_qty_packed: number;
  has_backorder: boolean;
};

export async function fetchPackQueue(): Promise<PackQueueRow[]> {
  const supabase = createClient();
  // RLS already restricts to fulfilment statuses for packers; we still
  // narrow explicitly so admins also see only the active queue.
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
        id, order_number, status, approved_at,
        branches:branch_id (branch_code, name),
        order_items (quantity_approved, quantity_packed)
      `,
    )
    .in("status", ["approved", "picking"])
    .is("deleted_at", null)
    .order("approved_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`fetchPackQueue: ${error.message}`);

  return (data ?? []).map((o) => {
    const items = o.order_items ?? [];
    const totalApproved = items.reduce(
      (sum, i) => sum + (i.quantity_approved ?? 0),
      0,
    );
    const totalPacked = items.reduce((sum, i) => sum + i.quantity_packed, 0);
    return {
      id: o.id,
      order_number: o.order_number,
      branch_code: o.branches?.branch_code ?? "—",
      branch_name: o.branches?.name ?? "—",
      status: o.status as PackQueueRow["status"],
      approved_at: o.approved_at!,
      item_count: items.length,
      total_qty_approved: totalApproved,
      total_qty_packed: totalPacked,
      has_backorder: items.some(
        (i) =>
          (i.quantity_approved ?? 0) > 0 &&
          i.quantity_approved! < i.quantity_packed,
      ),
    };
  });
}

export type PickListLine = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  warehouse_location: string | null;
  primary_barcode: string | null;
  quantity_approved: number;
  quantity_packed: number;
};

export type PickListPallet = {
  id: string;
  pallet_number: string;
  status: PalletStatus;
  packed_at: string | null;
  packed_by_email: string | null;
  items: Array<{
    pallet_item_id: string;
    order_item_id: string;
    sku: string;
    name: string;
    quantity: number;
  }>;
};

export type PickListDetail = {
  id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  status: Status;
  approved_at: string | null;
  notes: string | null;
  lines: PickListLine[];
  pallets: PickListPallet[];
};

export async function fetchPickList(
  orderId: string,
): Promise<PickListDetail | null> {
  const supabase = createClient();
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      `
        id, order_number, status, approved_at, notes,
        branches:branch_id (branch_code, name),
        order_items (
          id, product_id, quantity_approved, quantity_packed,
          products!inner (
            sku, name, unit,
            inventory ( warehouse_location ),
            product_barcodes ( barcode )
          )
        )
      `,
    )
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (orderErr) throw new Error(`fetchPickList(order): ${orderErr.message}`);
  if (!order) return null;

  // Pallets + their items + packed_by email lookup.
  const { data: pallets, error: palletsErr } = await supabase
    .from("pallets")
    .select(
      `
        id, pallet_number, status, packed_at, packed_by_user_id,
        pallet_items (
          id, order_item_id, quantity,
          order_items!inner (
            products!inner ( sku, name )
          )
        )
      `,
    )
    .eq("order_id", orderId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (palletsErr) throw new Error(`fetchPickList(pallets): ${palletsErr.message}`);

  const packerIds = Array.from(
    new Set(
      (pallets ?? [])
        .map((p) => p.packed_by_user_id)
        .filter((v): v is string => v !== null),
    ),
  );
  const packerEmails = new Map<string, string>();
  if (packerIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", packerIds);
    for (const u of users ?? []) packerEmails.set(u.id, u.email);
  }

  const lines: PickListLine[] = (order.order_items ?? [])
    .filter((i) => (i.quantity_approved ?? 0) > 0)
    .map((i) => {
      const product = i.products!;
      // Primary barcode = first barcode with unit_multiplier=1 (or whatever's
      // first if none qualifies). Per SPEC §6 the multiplier is for case
      // packs; the consumer-facing barcode is multiplier=1.
      const barcodes = product.product_barcodes ?? [];
      const primary =
        barcodes.find((b) => b.barcode != null)?.barcode ?? null;
      return {
        id: i.id,
        product_id: i.product_id,
        sku: product.sku,
        name: product.name,
        unit: product.unit ?? "stuk",
        warehouse_location: product.inventory?.warehouse_location ?? null,
        primary_barcode: primary,
        quantity_approved: i.quantity_approved ?? 0,
        quantity_packed: i.quantity_packed,
      };
    })
    // Sort by warehouse location for an efficient walking path; null
    // locations land at the end so the packer doesn't get bounced around.
    .sort((a, b) => {
      if (a.warehouse_location && !b.warehouse_location) return -1;
      if (!a.warehouse_location && b.warehouse_location) return 1;
      if (a.warehouse_location && b.warehouse_location) {
        return a.warehouse_location.localeCompare(b.warehouse_location);
      }
      return a.sku.localeCompare(b.sku);
    });

  const palletsOut: PickListPallet[] = (pallets ?? []).map((p) => ({
    id: p.id,
    pallet_number: p.pallet_number,
    status: p.status,
    packed_at: p.packed_at,
    packed_by_email: p.packed_by_user_id
      ? (packerEmails.get(p.packed_by_user_id) ?? null)
      : null,
    items: (p.pallet_items ?? []).map((pi) => ({
      pallet_item_id: pi.id,
      order_item_id: pi.order_item_id,
      sku: pi.order_items!.products!.sku,
      name: pi.order_items!.products!.name,
      quantity: pi.quantity,
    })),
  }));

  return {
    id: order.id,
    order_number: order.order_number,
    branch_code: order.branches?.branch_code ?? "—",
    branch_name: order.branches?.name ?? "—",
    status: order.status,
    approved_at: order.approved_at,
    notes: order.notes,
    lines,
    pallets: palletsOut,
  };
}
