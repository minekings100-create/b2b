import { redirect } from "next/navigation";
import { ChevronLeft, Building2 } from "lucide-react";
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
import { fetchSpendByBranch } from "@/lib/db/reports";
import { formatCents } from "@/lib/money";

import { WindowPicker } from "../_components/window-picker";
import { parseWindow } from "../_lib/window";

export const metadata = { title: "Spend by branch" };

export default async function SpendByBranchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!canSeeReport("spend-by-branch", session.roles)) redirect("/dashboard");

  const w = parseWindow(searchParams);
  const rows = await fetchSpendByBranch(w);
  const total = rows.reduce((acc, r) => acc + r.total_gross_cents, 0);

  const csvHref = `/api/reports/spend-by-branch/csv?from=${w.from}&to=${w.to}`;

  return (
    <>
      <PageHeader
        title="Spend by branch"
        description="Sum of invoice totals (issued/paid/overdue) per branch, by issue date."
        breadcrumbs={[
          { label: "Reports", href: "/reports" },
          { label: "Spend by branch" },
        ]}
        actions={
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />
      <div className="space-y-4 px-gutter py-6">
        <WindowPicker from={w.from} to={w.to} csvHref={csvHref} />
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="No invoices in this window"
            description="Try widening the From/To dates."
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Branch</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px] text-right">
                    Invoices
                  </TableHead>
                  <TableHead className="w-[160px] text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.branch_id} data-branch={r.branch_code}>
                    <TableCell className="font-numeric text-fg-muted">
                      {r.branch_code}
                    </TableCell>
                    <TableCell className="font-medium">{r.branch_name}</TableCell>
                    <TableCell numeric className="text-fg-muted">
                      {r.invoice_count}
                    </TableCell>
                    <TableCell numeric>
                      {formatCents(r.total_gross_cents)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell />
                  <TableCell className="text-right text-fg-muted">
                    Total
                  </TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {rows.reduce((a, r) => a + r.invoice_count, 0)}
                  </TableCell>
                  <TableCell numeric data-testid="spend-total">
                    {formatCents(total)}
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
