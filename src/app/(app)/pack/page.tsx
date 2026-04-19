import { redirect } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";

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
import { OrderStatusPill } from "@/components/app/order-status-pill";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import { fetchPackQueue } from "@/lib/db/packing";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pack queue" };

/**
 * Phase 4 — packer queue.
 *
 * Lists every order in `approved` or `picking` status, oldest
 * `approved_at` first (FIFO). RLS narrows packers to fulfilment-stage
 * orders; admin / super_admin see the same list cross-branch.
 */
export default async function PackQueuePage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (
    !hasAnyRole(session.roles, ["packer", "administration", "super_admin"])
  ) {
    redirect("/dashboard");
  }

  const queue = await fetchPackQueue();

  return (
    <>
      <PageHeader
        title="Pack queue"
        description="Approved orders awaiting picking, oldest first."
      />
      <div className="px-gutter pb-12">
        {queue.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Nothing to pack"
            description="When an order is HQ-approved it will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Packed / Approved</TableHead>
                <TableHead className="text-right">Approved at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row) => (
                <TableRow
                  key={row.id}
                  className="transition-colors hover:bg-surface-elevated"
                >
                  <TableCell className="font-numeric font-medium">
                    <Link
                      href={`/pack/${row.id}`}
                      className="text-fg hover:underline"
                    >
                      {row.order_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-fg">{row.branch_code}</span>
                    <span className="ml-2 text-fg-muted">{row.branch_name}</span>
                  </TableCell>
                  <TableCell>
                    <OrderStatusPill status={row.status} />
                  </TableCell>
                  <TableCell numeric>{row.item_count}</TableCell>
                  <TableCell numeric>
                    <span
                      className={cn(
                        row.total_qty_packed === row.total_qty_approved &&
                          row.total_qty_approved > 0
                          ? "text-success"
                          : "text-fg-muted",
                      )}
                    >
                      {row.total_qty_packed}
                    </span>
                    <span className="text-fg-subtle"> / </span>
                    <span>{row.total_qty_approved}</span>
                  </TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {new Date(row.approved_at).toLocaleString("nl-NL", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Amsterdam",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
