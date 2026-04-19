import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, isHqManager } from "@/lib/auth/roles";
import { fetchOrderDetail } from "@/lib/db/order-detail";
import { createClient } from "@/lib/supabase/server";

import {
  EditForm,
  type EditLine,
} from "./_components/edit-form.client";

export const metadata = { title: "Edit order" };

/**
 * Phase 3.4 — edit page (SPEC §8.9).
 *
 * Server Component: checks the status + role gate, loads the order's
 * current lines, hydrates the client form. Admin / BM-of-branch /
 * creator only — HQ Manager is explicitly denied here and the Edit
 * button on /orders/[id] doesn't render for them either.
 */
export default async function EditOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const order = await fetchOrderDetail(params.id);
  if (!order) notFound();

  if (order.status !== "submitted") {
    // Anything past `submitted` is frozen — kick back to the detail page
    // where the caller can see the current state.
    redirect(`/orders/${order.id}`);
  }

  const admin = isAdmin(session.roles);
  const hq = isHqManager(session.roles);
  const isCreator = order.created_by_user_id === session.user.id;
  const isBM = session.roles.some(
    (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
  );
  if (hq || !(admin || isCreator || isBM)) {
    redirect(`/orders/${order.id}`);
  }

  // Hydrate EditLine rows from the current order_items, picking up the
  // product-level min/max bounds for client-side validation.
  const supabase = createClient();
  const productIds = order.items.map((i) => i.product_id);
  const { data: productBounds } = await supabase
    .from("products")
    .select("id, min_order_qty, max_order_qty")
    .in("id", productIds);
  const boundsById = new Map(
    (productBounds ?? []).map((p) => [
      p.id,
      { min: p.min_order_qty, max: p.max_order_qty },
    ] as const),
  );

  const initialLines: EditLine[] = order.items.map((i) => ({
    product_id: i.product_id,
    sku: i.sku,
    name: i.name,
    unit_price_cents: i.unit_price_cents_snapshot,
    vat_rate: i.vat_rate_snapshot,
    min_order_qty: boundsById.get(i.product_id)?.min ?? 1,
    max_order_qty: boundsById.get(i.product_id)?.max ?? null,
    quantity: i.quantity_requested,
  }));

  return (
    <>
      <PageHeader
        title={`Edit ${order.order_number}`}
        description={`Branch ${order.branch_code} · ${order.branch_name}`}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: order.order_number, href: `/orders/${order.id}` },
          { label: "Edit" },
        ]}
        actions={
          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />

      <div className="px-gutter py-6">
        <EditForm
          orderId={order.id}
          lastEditedAt={order.last_edited_at}
          initialLines={initialLines}
          initialNotes={order.notes ?? ""}
        />
      </div>
    </>
  );
}
