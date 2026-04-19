import Link from "next/link";

import { OrderStatusPill } from "@/components/app/order-status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import type { RecentOrderRow } from "@/lib/db/dashboard";

/**
 * Phase 7a — shared "recent orders" panel used across role dashboards.
 * Compact 5-row table with link → order detail.
 */
export function RecentOrdersPanel({
  title,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  rows: RecentOrderRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold tracking-tight text-fg">
        {title}
      </h2>
      {rows.length === 0 ? (
        <EmptyState
          icon={null}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-numeric font-medium">
                    <Link
                      href={`/orders/${r.id}`}
                      className="text-fg hover:underline"
                    >
                      {r.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {r.branch_code}
                  </TableCell>
                  <TableCell>
                    <OrderStatusPill status={r.status} />
                  </TableCell>
                  <TableCell numeric>
                    {formatCents(r.total_gross_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
