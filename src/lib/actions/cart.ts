"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import {
  AddToCartInput,
  RemoveCartItemInput,
  SubmitOrderInput,
  UpdateCartItemInput,
} from "@/lib/validation/cart";
import { resolveBranchForCart } from "@/lib/db/cart";
import {
  allocateOrderNumber,
  fetchOutstandingInvoicesForBranch,
  recomputeOrderTotals,
} from "@/lib/db/orders";
import {
  adminAudience,
  managersForBranch,
} from "@/lib/email/recipients";
import { notify } from "@/lib/email/notify";
import {
  renderOrderSubmitted,
  renderOrderSubmittedWhileOverdue,
} from "@/lib/email/templates";
import type { Json } from "@/lib/supabase/types";

export type CartActionState =
  | { error: string; fieldErrors?: Record<string, string> }
  | {
      block: "outstanding_invoices";
      summary: { count: number; total_cents: number };
    }
  | { success: true }
  | undefined;

type Session = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;
type ActorOk = { ok: true; session: Session; branchId: string };
type ActorErr = { ok: false; error: string };

async function requireBranchActor(): Promise<ActorOk | ActorErr> {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!hasAnyRole(session.roles, ["branch_user", "branch_manager"])) {
    return { ok: false, error: "Only branch users can manage a cart" };
  }
  const branchId = await resolveBranchForCart(session.user.id);
  if (!branchId) {
    return { ok: false, error: "You're not assigned to a branch" };
  }
  return { ok: true, session, branchId };
}

/**
 * Find-or-create the active draft order for (user, branch). There is no
 * DB-level uniqueness on (user, branch, status=draft); we rely on this
 * path being the only place that creates drafts.
 */
async function findOrCreateDraft(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  branchId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("created_by_user_id", userId)
    .eq("branch_id", branchId)
    .eq("status", "draft")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  // `order_number` is NOT NULL UNIQUE — drafts get a temporary placeholder
  // scoped with DRAFT-<uuid>. On submit, we replace it with ORD-YYYY-NNNN.
  const tempNumber = `DRAFT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: created, error } = await supabase
    .from("orders")
    .insert({
      order_number: tempNumber,
      branch_id: branchId,
      created_by_user_id: userId,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function addToCart(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const actor = await requireBranchActor();
  if (!actor.ok) return { error: actor.error };
  const { session, branchId } = actor;

  const parsed = AddToCartInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();

  // Load product snapshot + quantity bounds.
  const { data: product, error: prodErr } = await supabase
    .from("products")
    .select("id, sku, unit_price_cents, vat_rate, min_order_qty, max_order_qty")
    .eq("id", parsed.data.product_id)
    .eq("active", true)
    .is("deleted_at", null)
    .single();
  if (prodErr || !product) return { error: "Product not found" };
  if (parsed.data.quantity < product.min_order_qty) {
    return {
      error: `Minimum order is ${product.min_order_qty}`,
      fieldErrors: { quantity: `Minimum is ${product.min_order_qty}` },
    };
  }
  if (
    product.max_order_qty != null &&
    parsed.data.quantity > product.max_order_qty
  ) {
    return {
      error: `Maximum order is ${product.max_order_qty}`,
      fieldErrors: { quantity: `Maximum is ${product.max_order_qty}` },
    };
  }

  const orderId = await findOrCreateDraft(supabase, session.user.id, branchId);

  // Merge quantities if the product is already in the cart.
  const { data: existingLine } = await supabase
    .from("order_items")
    .select("id, quantity_requested")
    .eq("order_id", orderId)
    .eq("product_id", product.id)
    .limit(1)
    .maybeSingle();

  const newQty = (existingLine?.quantity_requested ?? 0) + parsed.data.quantity;
  if (product.max_order_qty != null && newQty > product.max_order_qty) {
    return {
      error: `Cart would exceed the per-order max of ${product.max_order_qty}`,
      fieldErrors: { quantity: `Max combined: ${product.max_order_qty}` },
    };
  }
  const lineNet = newQty * product.unit_price_cents;

  if (existingLine) {
    const { error: updErr } = await supabase
      .from("order_items")
      .update({ quantity_requested: newQty, line_net_cents: lineNet })
      .eq("id", existingLine.id);
    if (updErr) return { error: updErr.message };
  } else {
    const { error: insErr } = await supabase.from("order_items").insert({
      order_id: orderId,
      product_id: product.id,
      quantity_requested: newQty,
      quantity_approved: null,
      unit_price_cents_snapshot: product.unit_price_cents,
      vat_rate_snapshot: product.vat_rate,
      line_net_cents: lineNet,
    });
    if (insErr) return { error: insErr.message };
  }

  await recomputeOrderTotals(supabase, orderId);

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: orderId,
    action: "cart_add",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: {
      product_id: product.id,
      sku: product.sku,
      quantity_added: parsed.data.quantity,
      new_line_qty: newQty,
    } as unknown as Json,
  });

  revalidatePath("/cart");
  revalidatePath("/catalog");
  return { success: true };
}

export async function updateCartItemQty(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const actor = await requireBranchActor();
  if (!actor.ok) return { error: actor.error };
  const { session } = actor;

  const parsed = UpdateCartItemInput.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();

  const { data: line, error: lineErr } = await supabase
    .from("order_items")
    .select(
      `id, order_id, product_id, unit_price_cents_snapshot,
       orders!inner (created_by_user_id, status),
       products!inner (min_order_qty, max_order_qty)`,
    )
    .eq("id", parsed.data.item_id)
    .maybeSingle();
  if (lineErr || !line) return { error: "Cart line not found" };

  const parentOrder = Array.isArray(line.orders) ? line.orders[0] : line.orders;
  const product = Array.isArray(line.products)
    ? line.products[0]
    : line.products;
  if (!parentOrder || parentOrder.created_by_user_id !== session.user.id) {
    return { error: "Not your cart" };
  }
  if (parentOrder.status !== "draft") {
    return { error: "Cannot edit a submitted order" };
  }

  if (product && parsed.data.quantity < product.min_order_qty) {
    return {
      error: `Minimum order is ${product.min_order_qty}`,
      fieldErrors: { quantity: `Minimum is ${product.min_order_qty}` },
    };
  }
  if (
    product?.max_order_qty != null &&
    parsed.data.quantity > product.max_order_qty
  ) {
    return {
      error: `Maximum order is ${product.max_order_qty}`,
      fieldErrors: { quantity: `Maximum is ${product.max_order_qty}` },
    };
  }

  const newNet = parsed.data.quantity * line.unit_price_cents_snapshot;
  const { error: updErr } = await supabase
    .from("order_items")
    .update({
      quantity_requested: parsed.data.quantity,
      line_net_cents: newNet,
    })
    .eq("id", line.id);
  if (updErr) return { error: updErr.message };

  await recomputeOrderTotals(supabase, line.order_id);

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: line.order_id,
    action: "cart_update_qty",
    actor_user_id: session.user.id,
    before_json: null,
    after_json: {
      item_id: line.id,
      product_id: line.product_id,
      new_qty: parsed.data.quantity,
    } as unknown as Json,
  });

  revalidatePath("/cart");
  return { success: true };
}

export async function removeCartItem(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const actor = await requireBranchActor();
  if (!actor.ok) return { error: actor.error };
  const { session } = actor;

  const parsed = RemoveCartItemInput.safeParse({
    item_id: formData.get("item_id"),
  });
  if (!parsed.success) return { error: "Invalid id" };

  const supabase = createClient();

  const { data: line } = await supabase
    .from("order_items")
    .select(
      `id, order_id, product_id,
       orders!inner (created_by_user_id, status)`,
    )
    .eq("id", parsed.data.item_id)
    .maybeSingle();
  if (!line) return { error: "Cart line not found" };
  const parentOrder = Array.isArray(line.orders) ? line.orders[0] : line.orders;
  if (!parentOrder || parentOrder.created_by_user_id !== session.user.id) {
    return { error: "Not your cart" };
  }
  if (parentOrder.status !== "draft") {
    return { error: "Cannot edit a submitted order" };
  }

  const { error } = await supabase.from("order_items").delete().eq("id", line.id);
  if (error) return { error: error.message };

  await recomputeOrderTotals(supabase, line.order_id);

  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: line.order_id,
    action: "cart_remove",
    actor_user_id: session.user.id,
    before_json: { item_id: line.id, product_id: line.product_id } as Json,
    after_json: null,
  });

  revalidatePath("/cart");
  return { success: true };
}

/**
 * Direct form-action wrapper. Plain `<form action={…}>` wants a
 * `(formData) => void | Promise<void>` signature — bridges the useFormState
 * shape to that. Errors surface via redirect to /cart with a query param.
 */
export async function submitOrderFormAction(formData: FormData): Promise<void> {
  const result = await submitOrder(undefined, formData);
  if (result && "error" in result) {
    const qs = new URLSearchParams({ error: result.error });
    redirect(`/cart?${qs.toString()}`);
  }
  // Success + block paths both redirect from inside submitOrder.
}

export async function submitOrder(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const actor = await requireBranchActor();
  if (!actor.ok) return { error: actor.error };
  const { session } = actor;

  const parsed = SubmitOrderInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Invalid submit" };

  const supabase = createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, branch_id, status, created_by_user_id")
    .eq("id", parsed.data.order_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { error: "Order not found" };
  if (order.created_by_user_id !== session.user.id) {
    return { error: "Not your order" };
  }
  if (order.status !== "draft") {
    return { error: "Order already submitted" };
  }

  const { count: itemCount } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id);
  if (!itemCount || itemCount === 0) {
    return { error: "Cart is empty" };
  }

  // Outstanding-invoice gate (SPEC §8.1 step 4). Surface the block state as
  // URL params on /cart so the page re-renders server-side with the banner
  // and the override form already present — avoids the useFormState +
  // redirect quirk that swallowed redirects when block-state was returned.
  const outstanding = await fetchOutstandingInvoicesForBranch(
    supabase,
    order.branch_id,
  );
  if (outstanding.count > 0 && !parsed.data.confirm_override) {
    const qs = new URLSearchParams({
      block: "outstanding",
      count: String(outstanding.count),
      total: String(outstanding.total_cents),
    });
    redirect(`/cart?${qs.toString()}`);
  }

  // Allocate number, flip status, stamp submitted_at.
  const now = new Date();
  const orderNumber = await allocateOrderNumber(supabase, now);

  // Phase 8 — carry the rush flag through at submit. `rush_set_by` is
  // the creator in this code path; HQ / admin can also flip it post-
  // submit via `setRush` in `src/lib/actions/pack-rush.ts`.
  const rushPatch = parsed.data.is_rush
    ? {
        is_rush: true,
        rush_set_by_user_id: session.user.id,
        rush_set_at: now.toISOString(),
      }
    : {};
  const { error: updErr } = await supabase
    .from("orders")
    .update({
      order_number: orderNumber,
      status: "submitted",
      submitted_at: now.toISOString(),
      ...rushPatch,
    })
    .eq("id", order.id)
    .eq("status", "draft");
  if (updErr) return { error: updErr.message };

  const usedOverride =
    parsed.data.confirm_override && outstanding.count > 0;
  await supabase.from("audit_log").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "submit",
    actor_user_id: session.user.id,
    before_json: { status: "draft" } as Json,
    after_json: {
      status: "submitted",
      order_number: orderNumber,
      override_outstanding: usedOverride,
    } as unknown as Json,
  });

  // Side-effect: notify branch managers (always) + admin pool (only when
  // the outstanding-invoice gate was overridden, per SPEC §8.1.4). Uses
  // the service-role client because notifications.insert is admin-only and
  // the branch-user context wouldn't satisfy the existing policy.
  await emitOrderSubmittedNotifications({
    orderId: order.id,
    orderNumber,
    branchId: order.branch_id,
    submitterEmail: session.user.email ?? "—",
    usedOverride,
    outstandingCount: outstanding.count,
    outstandingTotalCents: outstanding.total_cents,
  });

  revalidatePath("/cart");
  revalidatePath("/orders");
  redirect("/orders");
}

/**
 * Resolve recipients + render templates + write notifications rows for the
 * submit lifecycle event. Pulled out of submitOrder so the action body
 * stays readable. Failures are swallowed (logged) — a notifications outage
 * must not undo a submitted order.
 */
async function emitOrderSubmittedNotifications(opts: {
  orderId: string;
  orderNumber: string;
  branchId: string;
  submitterEmail: string;
  usedOverride: boolean;
  outstandingCount: number;
  outstandingTotalCents: number;
}): Promise<void> {
  try {
    const adm = createAdminClient();
    const { data: branch } = await adm
      .from("branches")
      .select("branch_code, name")
      .eq("id", opts.branchId)
      .maybeSingle();
    const branchCode = branch?.branch_code ?? "—";
    const branchName = branch?.name ?? "—";

    const { data: order } = await adm
      .from("orders")
      .select("total_gross_cents")
      .eq("id", opts.orderId)
      .maybeSingle();
    const { count: itemCount } = await adm
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", opts.orderId);

    const managers = await managersForBranch(adm, opts.branchId);
    if (managers.length > 0) {
      const rendered = renderOrderSubmitted({
        order_id: opts.orderId,
        order_number: opts.orderNumber,
        branch_code: branchCode,
        branch_name: branchName,
        submitter_email: opts.submitterEmail,
        total_gross_cents: order?.total_gross_cents ?? 0,
        item_count: itemCount ?? 0,
      });
      await notify({
        db: adm,
        type: "order_submitted",
        recipients: managers,
        rendered,
        payload: {
          order_id: opts.orderId,
          order_number: opts.orderNumber,
          branch_code: branchCode,
          href: `/orders/${opts.orderId}`,
        },
      });
    }

    if (opts.usedOverride) {
      const admins = await adminAudience(adm);
      if (admins.length > 0) {
        const rendered = renderOrderSubmittedWhileOverdue({
          order_id: opts.orderId,
          order_number: opts.orderNumber,
          branch_code: branchCode,
          branch_name: branchName,
          submitter_email: opts.submitterEmail,
          outstanding_count: opts.outstandingCount,
          outstanding_total_cents: opts.outstandingTotalCents,
        });
        await notify({
          db: adm,
          type: "order_submitted_while_overdue",
          recipients: admins,
          rendered,
          payload: {
            order_id: opts.orderId,
            order_number: opts.orderNumber,
            branch_code: branchCode,
            outstanding_count: opts.outstandingCount,
            outstanding_total_cents: opts.outstandingTotalCents,
            href: `/orders/${opts.orderId}`,
          },
        });
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[notify] order_submitted side-effect failed for ${opts.orderNumber}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
