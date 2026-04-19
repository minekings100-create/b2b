import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusPill } from "@/components/app/invoice-status-pill";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { fetchInvoiceDetail } from "@/lib/db/invoices";
import { formatCents } from "@/lib/money";

import { InvoiceActions } from "./_components/invoice-actions.client";
import { PayInvoiceButton } from "./_components/pay-invoice-button.client";

export const metadata = { title: "Invoice" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function methodLabel(m: string | null): string {
  switch (m) {
    case "manual_bank_transfer":
      return "Bank transfer";
    case "ideal_mollie":
      return "iDEAL (Mollie)";
    case "credit_note":
      return "Credit note";
    case "other":
      return "Other";
    default:
      return "—";
  }
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const invoice = await fetchInvoiceDetail(params.id);
  if (!invoice) notFound();

  const admin = isAdmin(session.roles);

  return (
    <>
      <PageHeader
        title={`Invoice ${invoice.invoice_number}`}
        description={`Branch ${invoice.branch_code} · ${invoice.branch_name}`}
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: invoice.invoice_number },
        ]}
        actions={
          <>
            <Link
              href="/invoices"
              className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            <a
              href={`/api/pdf/invoice/${invoice.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-elevated px-2.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-border hover:text-fg"
              data-testid="invoice-pdf-link"
            >
              <Printer className="h-3 w-3" />
              PDF
            </a>
            <InvoiceStatusPill status={invoice.status} size="lg" />
          </>
        }
      />

      <div className="space-y-6 px-gutter py-6">
        <section className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-5">
          <Meta label="Issued" value={formatDate(invoice.issued_at)} />
          <Meta label="Due" value={formatDate(invoice.due_at)} />
          <Meta label="Paid" value={formatDate(invoice.paid_at)} />
          <Meta label="Method" value={methodLabel(invoice.payment_method)} />
          <Meta
            label="Total"
            value={formatCents(invoice.total_gross_cents)}
            mono
          />
        </section>

        {invoice.order_id ? (
          <p className="text-sm text-fg-muted">
            From order{" "}
            <Link
              href={`/orders/${invoice.order_id}`}
              className="text-fg underline-offset-2 hover:underline"
            >
              {invoice.order_number ?? invoice.order_id}
            </Link>
          </p>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Lines</h2>
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[80px] text-right">Qty</TableHead>
                  <TableHead className="w-[96px] text-right">Unit</TableHead>
                  <TableHead className="w-[72px] text-right">VAT</TableHead>
                  <TableHead className="w-[110px] text-right">Net</TableHead>
                  <TableHead className="w-[110px] text-right">Gross</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell numeric>{l.quantity}</TableCell>
                    <TableCell numeric>
                      {formatCents(l.unit_price_cents)}
                    </TableCell>
                    <TableCell numeric>{l.vat_rate}%</TableCell>
                    <TableCell numeric>
                      {formatCents(l.line_net_cents)}
                    </TableCell>
                    <TableCell numeric>
                      {formatCents(l.line_net_cents + l.line_vat_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 text-sm">
          <span className="text-fg-muted">
            Net{" "}
            <span className="font-numeric text-fg">
              {formatCents(invoice.total_net_cents)}
            </span>
          </span>
          <span className="text-fg-muted">
            VAT{" "}
            <span className="font-numeric text-fg">
              {formatCents(invoice.total_vat_cents)}
            </span>
          </span>
          <span className="text-fg">
            Total{" "}
            <span className="font-numeric font-semibold">
              {formatCents(invoice.total_gross_cents)}
            </span>
          </span>
        </section>

        {(invoice.status === "issued" || invoice.status === "overdue") &&
        invoice.total_gross_cents > 0 ? (
          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight">Pay</h2>
            <PayInvoiceButton invoiceId={invoice.id} />
            <p className="text-xs text-fg-subtle">
              Redirects to iDEAL via Mollie. In development this routes
              through a mock checkout; production would use Mollie directly.
            </p>
          </section>
        ) : null}

        {admin ? (
          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight">Admin actions</h2>
            <InvoiceActions
              invoiceId={invoice.id}
              status={invoice.status}
            />
          </section>
        ) : null}

        {invoice.payments.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight">
              Payments
            </h2>
            <div className="overflow-hidden rounded-lg ring-1 ring-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recorded</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-fg-muted">
                        {formatDate(p.paid_at)}
                      </TableCell>
                      <TableCell>{methodLabel(p.method)}</TableCell>
                      <TableCell className="font-numeric text-fg-muted">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-fg-muted">
                        {p.recorded_by_email ?? "—"}
                      </TableCell>
                      <TableCell numeric>
                        {formatCents(p.amount_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Activity</h2>
          <ActivityTimeline
            entries={invoice.timeline}
            emptyHint="No activity recorded yet."
          />
        </section>
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
          mono ? "text-sm font-numeric text-fg" : "text-sm text-fg"
        }
      >
        {value}
      </p>
    </div>
  );
}
