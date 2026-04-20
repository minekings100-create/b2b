import { redirect } from "next/navigation";
import { ChevronLeft, Box } from "lucide-react";
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
import { fetchTopProducts } from "@/lib/db/reports";
import { formatCents } from "@/lib/money";

import { WindowPicker } from "../_components/window-picker";
import { parseWindow } from "../_lib/window";

export const metadata = { title: "Top products" };

export default async function TopProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!canSeeReport("top-products", session.roles)) redirect("/dashboard");

  const w = parseWindow(searchParams);
  const rows = await fetchTopProducts(w, 25);
  const csvHref = `/api/reports/top-products/csv?from=${w.from}&to=${w.to}`;

  return (
    <>
      <PageHeader
        title="Top products"
        description="Aggregated order-line value by SKU for orders past branch-approval in the window. Top 25."
        breadcrumbs={[
          { label: "Reports", href: "/reports" },
          { label: "Top products" },
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
            icon={<Box className="h-5 w-5" />}
            title="No orders in this window"
            description="No orders were branch-approved in the selected dates."
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[52px] text-right">#</TableHead>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px] text-right">Qty</TableHead>
                  <TableHead className="w-[160px] text-right">
                    Line total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.product_id}>
                    <TableCell numeric className="text-fg-subtle">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-numeric text-fg-muted">
                      {r.sku}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell numeric className="text-fg-muted">
                      {r.quantity}
                    </TableCell>
                    <TableCell numeric>
                      {formatCents(r.line_net_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
