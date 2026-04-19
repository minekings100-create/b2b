"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { EditOrderInput } from "@/lib/validation/order-edit";
import { recomputeOrderTotals } from "@/lib/db/orders";
import { managersForBranch } from "@/lib/email/recipients";
import { notify } from "@/lib/email/notify";
import { renderOrderEdited } from "@/lib/email/templates";
import type { Json } from "@/lib/supabase/types";

/**
 * Phase 3.4 — edit a submitted order.
 *
 * Flow (SPEC §8.9):
 *   1. Gate caller — creator OR BM-of-branch OR admin/super. HQ cannot edit.
 *   2. Status guard — `submitted` only.
 *   3. Concurrency guard — if the form was rendered with a known
 *      `last_edited_at`, reject writes when the DB value has advanced.
 *   4. Validate desired lines against live products (active, min/max qty).
 *   5. Diff current lines vs desired, apply via insert / update / delete.
 *   6. Recompute totals.
 *   7. Stamp `edit_count++`, `last_edited_at=now`, `last_edited_by`, AND
 *      `submitted_at=now` (restarts the §8.8 step-1 auto-cancel timer).
 *   8. Append one `order_edit_history` row with before/after snapshots.
 *   9. Append one `audit_log` row (`order_edited`) with a small delta summary.
 *  10. Emit `order_edited` notification to every BM of the branch.
 */

export type EditOrderState =
  | undefined
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | { ok: false; code: "stale"; error: string };

type OrderItemSnapshot = {
  product_id: string;
  sku: string;
  name: string;
  quantity_requested: number;
  unit_price_cents_snapshot: number;
  vat_rate_snapshot: number;
  line_net_cents: number;
};

/**
 * Parse the `lines` array sent by the form. Each desired line shows up as
 * two fields: `lines[i].product_id` + `lines[i].quantity`. Accept any
 * stable encoding — here we collect every `lines[<id>].quantity` pair
 * keyed by product UUID.
 */
function readLinesFromForm(
  formData: FormData,
): Array<{ product_id: string; quantity: number }> {
  const out = new Map<string, number>();
  for (const [key, value] of formData.entries()) {
    const m = /^line\[([0-9a-fA-F-]{36})\]\.quantity$/.exec(key);
    if (!m) continue;
    const productId = m[1]!;
    const qty = Number.parseInt(String(value), 10);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    out.set(productId, qty);
  }
  return Array.from(out.entries()).map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }));
}

export async function editOrder(
  _prev: EditOrderState,
  formData: FormData,
): Promise<EditOrderState> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const raw = {
    order_id: formData.get("order_id"),
    last_edited_at_expected: formData.get("last_edited_at_expected") ?? null,
    notes: formData.get("notes") ?? "",
    lines: readLinesFromForm(formData),
  };
  const parsed = EditOrderInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { order_id, last_edited_at_expected, notes, lines } = parsed.data;

  const supabase = createClient();

  // Load the order + existing items. RLS gates cross-branch reads.
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      `
        id, branch_id, status, created_by_user_id, last_edited_at, notes,
        edit_count,
        order_items (
          id, product_id, quantity_requested, quantity_approved,
          unit_price_cents_snapshot, vat_rate_snapshot, line_net_cents,
          products!inner ( sku, name )
        )
      `,
    )
    .eq("id", order_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (orderErr || !order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.status !== "submitted") {
    return {
      ok: false,
      error:
        "This order can no longer be edited — its status is not `submitted`.",
    };
  }

  // Role gate. Creator always; BM-of-branch yes; admin/super yes; HQ no.
  const caller = session.user.id;
  const isCreator = order.created_by_user_id === caller;
  const isBranchManager = session.roles.some(
    (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
  );
  const admin = isAdmin(session.roles);
  if (!isCreator && !isBranchManager && !admin) {
    return { ok: false, error: "You don't have permission to edit this order." };
  }

  // Concurrency guard — reject if someone else edited after the form rendered.
  if (
    last_edited_at_expected !== null &&
    order.last_edited_at !== null &&
    order.last_edited_at !== last_edited_at_expected
  ) {
    return {
      ok: false,
      code: "stale",
      error:
        "This order was edited by someone else while you were working. Refresh to see the latest version.",
    };
  }

  // Load live products for validation (active, min/max). Existing price
  // snapshots stay — we DO NOT re-snapshot prices on edit (that would
  // silently change totals if list prices moved between submit + edit;
  // edits are about quantity, not re-pricing).
  const productIds = lines.map((l) => l.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select(
      "id, sku, name, unit_price_cents, vat_rate, min_order_qty, max_order_qty, active, deleted_at",
    )
    .in("id", productIds);
  if (prodErr) return { ok: false, error: prodErr.message };
  const productById = new Map(
    (products ?? []).map((p) => [p.id, p] as const),
  );

  for (const line of lines) {
    const p = productById.get(line.product_id);
    if (!p || !p.active || p.deleted_at) {
      return {
        ok: false,
        error: `Product is no longer available`,
        fieldErrors: { [`line[${line.product_id}]`]: "Unavailable" },
      };
    }
    if (line.quantity < p.min_order_qty) {
      return {
        ok: false,
        error: `${p.sku}: min order is ${p.min_order_qty}`,
        fieldErrors: { [`line[${line.product_id}]`]: `min ${p.min_order_qty}` },
      };
    }
    if (p.max_order_qty != null && line.quantity > p.max_order_qty) {
      return {
        ok: false,
        error: `${p.sku}: max order is ${p.max_order_qty}`,
        fieldErrors: { [`line[${line.product_id}]`]: `max ${p.max_order_qty}` },
      };
    }
  }

  // Build before-snapshot from current items (full shape for history).
  const existingItems = (order.order_items ?? []).map((i) => ({
    id: i.id,
    product_id: i.product_id,
    sku: i.products!.sku,
    name: i.products!.name,
    quantity_requested: i.quantity_requested,
    unit_price_cents_snapshot: i.unit_price_cents_snapshot,
    vat_rate_snapshot: i.vat_rate_snapshot,
    line_net_cents: i.line_net_cents,
  }));

  // Compute the target insert / update / delete sets.
  const existingByProduct = new Map(
    existingItems.map((i) => [i.product_id, i] as const),
  );
  const desiredByProduct = new Map(lines.map((l) => [l.product_id, l] as const));

  const toInsert: Array<{
    order_id: string;
    product_id: string;
    quantity_requested: number;
    quantity_approved: number | null;
    unit_price_cents_snapshot: number;
    vat_rate_snapshot: number;
    line_net_cents: number;
  }> = [];
  const toUpdate: Array<{
    id: string;
    quantity_requested: number;
    line_net_cents: number;
  }> = [];
  const toDeleteIds: string[] = [];

  for (const desired of lines) {
    const product = productById.get(desired.product_id)!;
    const existing = existingByProduct.get(desired.product_id);
    if (existing) {
      if (existing.quantity_requested !== desired.quantity) {
        toUpdate.push({
          id: existing.id,
          quantity_requested: desired.quantity,
          line_net_cents:
            desired.quantity * existing.unit_price_cents_snapshot,
        });
      }
    } else {
      toInsert.push({
        order_id,
        product_id: desired.product_id,
        quantity_requested: desired.quantity,
        quantity_approved: null,
        unit_price_cents_snapshot: product.unit_price_cents,
        vat_rate_snapshot: product.vat_rate,
        line_net_cents: desired.quantity * product.unit_price_cents,
      });
    }
  }
  for (const existing of existingItems) {
    if (!desiredByProduct.has(existing.product_id)) {
      toDeleteIds.push(existing.id);
    }
  }

  // Apply mutations. Session client keeps RLS in force — creator and BM
  // of branch already have UPDATE rights on their own order per
  // `orders_update` in the foundation RLS.
  if (toDeleteIds.length > 0) {
    const { error } = await supabase
      .from("order_items")
      .delete()
      .in("id", toDeleteIds);
    if (error) return { ok: false, error: error.message };
  }
  for (const u of toUpdate) {
    const { error } = await supabase
      .from("order_items")
      .update({
        quantity_requested: u.quantity_requested,
        line_net_cents: u.line_net_cents,
      })
      .eq("id", u.id);
    if (error) return { ok: false, error: error.message };
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("order_items").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }

  // Recompute totals from the new item set.
  const totals = await recomputeOrderTotals(supabase, order_id);

  const nowIso = new Date().toISOString();

  // Status-guarded header update. Guards on BOTH `status = 'submitted'`
  // AND `edit_count = <expected>` so two concurrent edits can't both
  // claim the same post-increment count; the second write sees 0 rows
  // and surfaces a friendly retry. If `last_edited_at` was also passed
  // we already rejected above; the edit_count guard handles the narrow
  // window between read and write.
  const expectedEditCount = order.edit_count;
  const { data: headerUpdated, error: headerErr } = await supabase
    .from("orders")
    .update({
      edit_count: expectedEditCount + 1,
      last_edited_at: nowIso,
      last_edited_by_user_id: caller,
      submitted_at: nowIso,
      notes: notes || null,
    })
    .eq("id", order_id)
    .eq("status", "submitted")
    .eq("edit_count", expectedEditCount)
    .select("id")
    .maybeSingle();
  if (headerErr || !headerUpdated) {
    return {
      ok: false,
      error: "Order state changed under you — refresh and try again.",
    };
  }

  // Build after-snapshot from the post-write state (single query).
  const { data: afterRows } = await supabase
    .from("order_items")
    .select(
      `
        id, product_id, quantity_requested,
        unit_price_cents_snapshot, vat_rate_snapshot, line_net_cents,
        products!inner ( sku, name )
      `,
    )
    .eq("order_id", order_id);
  const afterSnapshot: OrderItemSnapshot[] = (afterRows ?? []).map((i) => ({
    product_id: i.product_id,
    sku: i.products!.sku,
    name: i.products!.name,
    quantity_requested: i.quantity_requested,
    unit_price_cents_snapshot: i.unit_price_cents_snapshot,
    vat_rate_snapshot: i.vat_rate_snapshot,
    line_net_cents: i.line_net_cents,
  }));
  const beforeSnapshot: OrderItemSnapshot[] = existingItems.map(
    ({ id: _id, ...rest }) => rest,
  );

  // Append the history row — session client, RLS enforces the caller matches.
  const { error: histErr } = await supabase.from("order_edit_history").insert({
    order_id,
    edited_by_user_id: caller,
    edit_reason: null,
    before_snapshot: { items: beforeSnapshot } as unknown as Json,
    after_snapshot: { items: afterSnapshot } as unknown as Json,
  });
  if (histErr) return { ok: false, error: histErr.message };

  // Audit summary: line-count delta, total delta. Small payload so the
  // timeline's describeAction can render it without refetching snapshots.
  const lineDelta = afterSnapshot.length - beforeSnapshot.length;
  const beforeGross = beforeSnapshot.reduce(
    (sum, i) =>
      sum + Math.round(i.line_net_cents * (1 + i.vat_rate_snapshot / 100)),
    0,
  );
  const totalDelta = totals.gross - beforeGross;
  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order_id,
    action: "order_edited",
    actor_user_id: caller,
    before_json: { line_count: beforeSnapshot.length, total_gross_cents: beforeGross } as Json,
    after_json: {
      line_count: afterSnapshot.length,
      total_gross_cents: totals.gross,
      line_delta: lineDelta,
      total_delta_cents: totalDelta,
    } as unknown as Json,
  });

  // Emit the re-approval signal to every BM of the branch. Service-role
  // client because the editor may not be a BM themselves, but notify()
  // inserts notifications rows on behalf of the recipients.
  await emitOrderEditedNotifications({
    orderId: order_id,
    branchId: order.branch_id,
    editorEmail: session.user.email ?? "—",
    lineDelta,
    totalDeltaCents: totalDelta,
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] order_edited side-effect failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  });

  revalidatePath(`/orders/${order_id}`);
  revalidatePath(`/orders`);
  revalidatePath(`/approvals`);
  // Hand-off to the detail page so the user sees the refreshed order
  // immediately (SPEC §8.9 step 5). `redirect()` throws NEXT_REDIRECT
  // which propagates past useFormState's wrapper — the client follows
  // the navigation without the form state seeing the "ok" result.
  redirect(`/orders/${order_id}?saved=1`);
}

async function emitOrderEditedNotifications(opts: {
  orderId: string;
  branchId: string;
  editorEmail: string;
  lineDelta: number;
  totalDeltaCents: number;
}): Promise<void> {
  const adm = createAdminClient();
  const { data: branch } = await adm
    .from("branches")
    .select("branch_code, name")
    .eq("id", opts.branchId)
    .maybeSingle();
  const { data: order } = await adm
    .from("orders")
    .select("order_number")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (!branch || !order) return;

  const recipients = await managersForBranch(adm, opts.branchId);
  if (recipients.length === 0) return;

  const rendered = renderOrderEdited({
    order_id: opts.orderId,
    order_number: order.order_number,
    branch_code: branch.branch_code,
    branch_name: branch.name,
    editor_email: opts.editorEmail,
    line_delta: opts.lineDelta,
    total_delta_cents: opts.totalDeltaCents,
  });
  await notify({
    db: adm,
    type: "order_edited",
    recipients,
    rendered,
    payload: {
      order_id: opts.orderId,
      order_number: order.order_number,
      branch_code: branch.branch_code,
      line_delta: opts.lineDelta,
      total_delta_cents: opts.totalDeltaCents,
      href: `/orders/${opts.orderId}`,
    },
  });
}
