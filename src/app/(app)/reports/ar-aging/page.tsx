import { redirect } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import Link from "next/link";

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
import { getUserWithRoles } from "@/lib/auth/session";
import { canSeeReport } from "@/lib/auth/reports";
import { fetchArAging, type ArAgingBucket } from "@/lib/db/reports";
import { formatCents } from "@/lib/money";

export const metadata = { title: "AR aging" };

const BUCKET_LABEL: Record<ArAgingBucket, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

const BUCKET_ORDER: ArAgingBucket[] = [
  "current",
  "1-30",
  "31-60",
  "61-90",
  "90+",
];

/**
 * Phase 7b-2c — AR aging (finance-only).
 *
 * No date-window picker here — aging is a snapshot relative to NOW,
 * not a historical window. The CSV export mirrors what's on screen.
 */
export default async function ArAgingPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!canSeeReport("ar-aging", session.roles)) redirect("/dashboard");

  const { rows, totals_by_bucket } = await fetchArAging();
  const csvHref = `/api/reports/ar-aging/csv`;
  const grand = BUCKET_ORDER.reduce((a, b) => a + totals_by_bucket[b], 0);

  return (
    <>
      <PageHeader
        title="AR aging"
        description="Unpaid invoices as of now, bucketed by days overdue. Finance-only."
        breadcrumbs={[
          { label: "Reports", href: "/reports" },
          { label: "AR aging" },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            <a
              href={csvHref}
              className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg hover:bg-surface-elevated"
              download
            >
              Download CSV
            </a>
          </div>
        }
      />
      <div className="space-y-6 px-gutter py-6">
        {/* Summary cards row. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {BUCKET_ORDER.map((b) => (
            <div
              key={b}
              className="rounded-lg bg-surface p-3 ring-1 ring-border"
              data-bucket={b}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                {BUCKET_LABEL[b]}
              </p>
              <p className="mt-1 font-numeric text-xl font-semibold text-fg">
                {formatCents(totals_by_bucket[b])}
              </p>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Nothing unpaid right now"
            description="Every issued invoice is paid or still within its due date."
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Invoice</TableHead>
                  <TableHead className="w-[120px]">Branch</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-[140px]">Due</TableHead>
                  <TableHead className="w-[120px] text-right">
                    Days overdue
                  </TableHead>
                  <TableHead className="w-[140px]">Bucket</TableHead>
                  <TableHead className="w-[140px] text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.invoice_id} data-bucket={r.bucket}>
                    <TableCell className="font-numeric">
                      {r.invoice_number}
                    </TableCell>
                    <TableCell className="font-numeric text-fg-muted">
                      {r.branch_code}
                    </TableCell>
                    <TableCell className="text-fg">{r.branch_name}</TableCell>
                    <TableCell className="font-numeric text-xs text-fg-muted">
                      {r.due_at.slice(0, 10)}
                    </TableCell>
                    <TableCell numeric>
                      {r.days_overdue === 0 ? "—" : r.days_overdue}
                    </TableCell>
                    <TableCell className="text-fg-muted">
                      {BUCKET_LABEL[r.bucket]}
                    </TableCell>
                    <TableCell numeric>
                      {formatCents(r.total_gross_cents)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell colSpan={6} className="text-right text-fg-muted">
                    Outstanding total
                  </TableCell>
                  <TableCell numeric data-testid="ar-grand-total">
                    {formatCents(grand)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
