import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { z } from "zod";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusPill } from "@/components/app/invoice-status-pill";
import { SortableHeader } from "@/components/app/sortable-header";
import { getUserWithRoles } from "@/lib/auth/session";
import {
  fetchVisibleInvoices,
  INVOICE_STATUSES,
  INVOICES_SORTABLE_COLUMNS,
  type InvoicesSortColumn,
} from "@/lib/db/invoices";
import { formatCents } from "@/lib/money";
import { parseSortParam } from "@/lib/url/sort";

import {
  InvoiceStatusFilterChips,
  type InvoiceStatusFilter,
} from "./_components/status-filter-chips";

export const metadata = { title: "Invoices" };

const StatusParam = z.enum(INVOICE_STATUSES).nullable().optional();

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string; dir?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const statusParam = StatusParam.safeParse(searchParams.status ?? null);
  const status: InvoiceStatusFilter | null = statusParam.success
    ? (statusParam.data ?? null)
    : null;
  const activeFilter: InvoiceStatusFilter | "all" = status ?? "all";

  const sort = parseSortParam<InvoicesSortColumn>(
    { sort: searchParams.sort, dir: searchParams.dir },
    INVOICES_SORTABLE_COLUMNS,
    null,
  );

  const rows = await fetchVisibleInvoices(status, sort);
  const preserve = { status: status ?? null };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Drafts, issued, overdue, and paid invoices."
      />
      <InvoiceStatusFilterChips active={activeFilter} />
      <div className="px-gutter py-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={status ? `No ${status} invoices` : "No invoices yet"}
            description={
              status
                ? "Try a different filter or clear the status to see everything."
                : "Issued and paid invoices will appear here as orders get billed."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader
                  basePath="/invoices"
                  column="invoice_number"
                  current={sort}
                  preserveParams={preserve}
                >
                  Invoice
                </SortableHeader>
                <TableHead>Order</TableHead>
                <SortableHeader
                  basePath="/invoices"
                  column="branch"
                  current={sort}
                  preserveParams={preserve}
                >
                  Branch
                </SortableHeader>
                <SortableHeader
                  basePath="/invoices"
                  column="status"
                  current={sort}
                  preserveParams={preserve}
                >
                  Status
                </SortableHeader>
                <SortableHeader
                  basePath="/invoices"
                  column="issued_at"
                  current={sort}
                  preserveParams={preserve}
                  align="right"
                >
                  Issued
                </SortableHeader>
                <SortableHeader
                  basePath="/invoices"
                  column="due_at"
                  current={sort}
                  preserveParams={preserve}
                  align="right"
                >
                  Due
                </SortableHeader>
                <SortableHeader
                  basePath="/invoices"
                  column="total_gross_cents"
                  current={sort}
                  preserveParams={preserve}
                  align="right"
                >
                  Total
                </SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="transition-colors hover:bg-surface-elevated"
                >
                  <TableCell className="font-numeric font-medium">
                    <Link
                      href={`/invoices/${r.id}`}
                      className="text-fg hover:underline"
                      data-testid={`invoice-row-${r.invoice_number}`}
                    >
                      {r.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="font-numeric text-fg-muted">
                    {r.order_number ? (
                      <Link
                        href={`/orders/${r.order_id}`}
                        className="hover:underline"
                      >
                        {r.order_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-fg">{r.branch_code}</span>
                    <span className="ml-2 text-fg-muted">{r.branch_name}</span>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusPill status={r.status} />
                  </TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {formatDate(r.issued_at)}
                  </TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {formatDate(r.due_at)}
                  </TableCell>
                  <TableCell numeric>{formatCents(r.total_gross_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
