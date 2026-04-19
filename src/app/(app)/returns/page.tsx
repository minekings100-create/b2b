import { redirect } from "next/navigation";
import Link from "next/link";
import { Archive } from "lucide-react";
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
import { ReturnStatusPill } from "@/components/app/return-status-pill";
import { getUserWithRoles } from "@/lib/auth/session";
import { fetchVisibleReturns, RETURN_STATUSES } from "@/lib/db/returns";

import {
  ReturnStatusFilterChips,
  type ReturnStatusFilter,
} from "./_components/status-filter-chips";

export const metadata = { title: "Returns" };

const StatusParam = z.enum(RETURN_STATUSES).nullable().optional();

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const statusParam = StatusParam.safeParse(searchParams.status ?? null);
  const status: ReturnStatusFilter | null = statusParam.success
    ? (statusParam.data ?? null)
    : null;
  const activeFilter: ReturnStatusFilter | "all" = status ?? "all";

  const rows = await fetchVisibleReturns(status);

  return (
    <>
      <PageHeader
        title="Returns"
        description="RMA requests, approvals, and resolutions."
      />
      <ReturnStatusFilterChips active={activeFilter} />
      <div className="px-gutter py-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" />}
            title={status ? `No ${status} returns` : "No returns yet"}
            description={
              status
                ? "Try a different filter or clear the status to see everything."
                : "Branches open returns against delivered orders; admins review them here."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RMA</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead className="text-right">Requested</TableHead>
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
                      href={`/returns/${r.id}`}
                      className="text-fg hover:underline"
                      data-testid={`return-row-${r.rma_number}`}
                    >
                      {r.rma_number}
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
                    <ReturnStatusPill status={r.status} />
                  </TableCell>
                  <TableCell numeric>{r.item_count}</TableCell>
                  <TableCell className="text-fg-muted">
                    {r.requested_by_email ?? "—"}
                  </TableCell>
                  <TableCell numeric className="text-fg-muted">
                    {formatDate(r.requested_at)}
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
