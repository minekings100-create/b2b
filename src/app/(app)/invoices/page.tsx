import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { z } from "zod";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableHead } from "@/components/ui/table";
import { SortableHeader } from "@/components/app/sortable-header";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  fetchVisibleInvoices,
  INVOICE_STATUSES,
  INVOICES_SORTABLE_COLUMNS,
  type InvoicesSortColumn,
} from "@/lib/db/invoices";
import { parseSortParam } from "@/lib/url/sort";
import { getSkipEmailPreview } from "@/lib/actions/invoice-reminders";

import {
  InvoiceStatusFilterChips,
  type InvoiceStatusFilter,
} from "./_components/status-filter-chips";
import { BulkReminderShell } from "./_components/bulk-reminder-shell.client";

export const metadata = { title: "Invoices" };

const StatusParam = z.enum(INVOICE_STATUSES).nullable().optional();

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
  const admin = isAdmin(session.roles);
  const showCheckboxes = admin && status === "overdue";
  const skipEmailPreview = admin ? await getSkipEmailPreview() : false;

  const sortableHeaders = (
    <>
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
    </>
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          showCheckboxes
            ? "Select one or more overdue invoices to send reminder emails in bulk. Preview-first; per-invoice audit rows; administration + super_admin only."
            : "Drafts, issued, overdue, and paid invoices."
        }
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
          <BulkReminderShell
            rows={rows.map((r) => ({
              id: r.id,
              invoice_number: r.invoice_number,
              order_number: r.order_number,
              order_id: r.order_id,
              branch_code: r.branch_code,
              branch_name: r.branch_name,
              status: r.status,
              issued_at: r.issued_at,
              due_at: r.due_at,
              total_gross_cents: r.total_gross_cents,
            }))}
            showCheckboxes={showCheckboxes}
            skipEmailPreview={skipEmailPreview}
            headerSlot={sortableHeaders}
          />
        )}
      </div>
    </>
  );
}
