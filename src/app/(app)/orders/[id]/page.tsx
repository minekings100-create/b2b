import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, AlertCircle, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusPill } from "@/components/app/order-status-pill";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { OrderEditHistory } from "@/components/app/order-edit-history";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin, isHqManager } from "@/lib/auth/roles";
import { fetchOrderDetail } from "@/lib/db/order-detail";
import { fetchOrderEditHistory } from "@/lib/db/order-edit-history";
import { fetchOpenInvoiceForOrder } from "@/lib/db/invoices";
import { formatCents } from "@/lib/money";
import { ApproveForm } from "./_components/approve-form";
import { HqApproveForm } from "./_components/hq-approve-form";
import { RejectForm } from "./_components/reject-form";
import { CancelForm } from "./_components/cancel-form";
import { CreateInvoiceForm } from "./_components/create-invoice-form";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SearchParams = { error?: string };

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const order = await fetchOrderDetail(params.id);
  if (!order) notFound();

  const admin = isAdmin(session.roles);
  const hq = isHqManager(session.roles);
  const isMyBranchManager = session.roles.some(
    (r) => r.role === "branch_manager" && r.branch_id === order.branch_id,
  );
  // Step-1 (BM) decision lives only when the order is `submitted` and the
  // caller is BM-of-branch or admin. HQ explicitly cannot substitute here
  // (SPEC §8.2 non-substitution rule).
  const canBranchDecide =
    (admin || isMyBranchManager) && order.status === "submitted";
  // Step-2 (HQ) decision lives only when the order is `branch_approved`
  // and the caller is HQ Manager or admin.
  const canHqDecide =
    (admin || hq) && order.status === "branch_approved";
  const canCancel =
    admin ||
    hq ||
    isMyBranchManager ||
    (order.created_by_user_id === session.user.id && order.status === "draft");
  const cancelEligibleStatuses = [
    "draft",
    "submitted",
    "branch_approved",
    "approved",
    "picking",
  ];
  const showCancel = canCancel && cancelEligibleStatuses.includes(order.status);

  // Phase 3.4 — Edit is available while the order is `submitted` and the
  // caller is creator / BM-of-branch / admin. HQ Manager CANNOT edit
  // (SPEC §8.9: HQ is only approve/reject at step 2).
  const isCreator = order.created_by_user_id === session.user.id;
  const canEdit =
    order.status === "submitted" && (admin || isMyBranchManager || isCreator);

  const editHistory =
    order.edit_count > 0 ? await fetchOrderEditHistory(order.id) : [];

  // Phase 5 — invoice integration. Show "Create draft invoice" for
  // admins on fulfilled orders without an open invoice; otherwise link
  // to the existing one. Branch users see only the link (read-only).
  const invoiceableStatuses = ["packed", "shipped", "delivered", "closed"];
  const orderIsInvoiceable = invoiceableStatuses.includes(order.status);
  const openInvoice = orderIsInvoiceable
    ? await fetchOpenInvoiceForOrder(order.id)
    : null;
  const canCreateInvoice = admin && orderIsInvoiceable && openInvoice === null;

  return (
    <>
      <PageHeader
        title={`Order ${order.order_number}`}
        description={`Branch ${order.branch_code} · ${order.branch_name} · by ${order.created_by_email ?? "—"}`}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: order.order_number },
        ]}
        actions={
          <>
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            {canEdit ? (
              <Link
                href={`/orders/${order.id}/edit`}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface px-2.5 text-xs font-medium text-fg ring-1 ring-inset ring-border hover:bg-surface-elevated"
                data-testid="order-edit-button"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Link>
            ) : null}
          </>
        }
      />

      <div className="space-y-6 px-gutter py-6">
        {/* Prominent status banner — surfaces lifecycle state above the
            fold. The pill colour mapping is centralised in OrderStatusPill
            (SPEC §4 status tokens). */}
        <section
          aria-label="Order status"
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
        >
          <OrderStatusPill status={order.status} size="lg" />
          {order.branch_approved_by_email ? (
            <span className="text-sm text-fg-muted">
              <span>Branch-approved by</span>{" "}
              <span className="text-fg">{order.branch_approved_by_email}</span>
              {order.branch_approved_at ? (
                <span> · {formatDate(order.branch_approved_at)}</span>
              ) : null}
            </span>
          ) : null}
          {order.approved_by_email ? (
            <span className="text-sm text-fg-muted">
              <span>
                {order.status === "rejected" ? "Decided" : "HQ-approved"} by
              </span>{" "}
              <span className="text-fg">{order.approved_by_email}</span>
              {order.approved_at ? (
                <span> · {formatDate(order.approved_at)}</span>
              ) : null}
            </span>
          ) : null}
        </section>

        {searchParams.error ? (
          <p
            role="alert"
            className="inline-flex items-center gap-2 rounded-md bg-danger-subtle/40 ring-1 ring-danger/30 px-3 py-2 text-sm text-danger-subtle-fg"
          >
            <AlertCircle className="h-4 w-4" aria-hidden />
            {searchParams.error}
          </p>
        ) : null}

        {order.status === "rejected" && order.rejection_reason ? (
          <section className="rounded-lg bg-danger-subtle/40 ring-1 ring-inset ring-danger/30 p-4 space-y-1">
            <p className="label-meta text-danger-subtle-fg">Rejection reason</p>
            <p className="text-sm text-fg">{order.rejection_reason}</p>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-5">
          <Meta label="Created" value={formatDate(order.created_at)} />
          <Meta label="Submitted" value={formatDate(order.submitted_at)} />
          <Meta
            label="Branch-approved"
            value={formatDate(order.branch_approved_at)}
          />
          <Meta
            label={order.status === "rejected" ? "Decided" : "HQ-approved"}
            value={formatDate(order.approved_at)}
          />
          <Meta label="Total" value={formatCents(order.total_gross_cents)} mono />
        </section>

        {canBranchDecide ? (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight">
                Branch review (step 1)
              </h2>
              <ApproveForm
                orderId={order.id}
                items={order.items}
                lastEditedAt={order.last_edited_at}
              />
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <RejectForm orderId={order.id} />
              {showCancel ? <CancelForm orderId={order.id} /> : null}
            </div>
          </>
        ) : canHqDecide ? (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight">
                HQ review (step 2)
              </h2>
              <HqApproveForm orderId={order.id} items={order.items} />
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <RejectForm orderId={order.id} />
              {showCancel ? <CancelForm orderId={order.id} /> : null}
            </div>
          </>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight">Items</h2>
              <div className="overflow-hidden rounded-lg ring-1 ring-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[80px] text-right">Req.</TableHead>
                      <TableHead className="w-[80px] text-right">Appr.</TableHead>
                      <TableHead className="w-[80px] text-right">Packed</TableHead>
                      <TableHead className="w-[80px] text-right">Ship.</TableHead>
                      <TableHead className="w-[96px] text-right">Price</TableHead>
                      <TableHead className="w-[112px] text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-numeric text-fg-muted">
                          {it.sku}
                        </TableCell>
                        <TableCell>{it.name}</TableCell>
                        <TableCell numeric>{it.quantity_requested}</TableCell>
                        <TableCell numeric>
                          {it.quantity_approved ?? "—"}
                        </TableCell>
                        <TableCell numeric>{it.quantity_packed}</TableCell>
                        <TableCell numeric>{it.quantity_shipped}</TableCell>
                        <TableCell numeric>
                          {formatCents(it.unit_price_cents_snapshot)}
                        </TableCell>
                        <TableCell numeric>
                          {formatCents(it.line_net_cents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
            {showCancel ? <CancelForm orderId={order.id} /> : null}
          </>
        )}

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Activity</h2>
          <ActivityTimeline
            entries={order.timeline}
            emptyHint="No activity recorded yet."
          />
        </section>

        {order.edit_count > 0 ? (
          <OrderEditHistory
            entries={editHistory}
            totalEdits={order.edit_count}
          />
        ) : null}

        {orderIsInvoiceable ? (
          <section className="space-y-3" data-testid="order-invoice-section">
            <h2 className="text-base font-semibold tracking-tight">Invoice</h2>
            {openInvoice ? (
              <p className="text-sm text-fg-muted">
                Linked to invoice{" "}
                <Link
                  href={`/invoices/${openInvoice.id}`}
                  className="font-numeric text-fg underline-offset-2 hover:underline"
                  data-testid="order-invoice-link"
                >
                  {openInvoice.invoice_number}
                </Link>{" "}
                ({openInvoice.status}).
              </p>
            ) : canCreateInvoice ? (
              <CreateInvoiceForm orderId={order.id} />
            ) : (
              <p className="text-sm text-fg-muted">
                No invoice yet. An administrator will create one shortly.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="label-meta">{label}</p>
      <p
        className={
          mono
            ? "text-sm font-numeric text-fg"
            : "text-sm text-fg"
        }
      >
        {value}
      </p>
    </div>
  );
}
