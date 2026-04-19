import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
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
import { OrderStatusPill } from "@/components/app/order-status-pill";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUserWithRoles } from "@/lib/auth/session";
import {
  fetchVisibleOrders,
  ORDERS_SORTABLE_COLUMNS,
  type OrderStatusFilter,
  type OrdersSortColumn,
} from "@/lib/db/orders-list";
import { formatCents } from "@/lib/money";
import { parseSortParam } from "@/lib/url/sort";
import { SortableHeader } from "@/components/app/sortable-header";
import { StatusFilterChips } from "./_components/status-filter-chips";

export const metadata = { title: "Orders" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const StatusParam = z
  .enum([
    "draft",
    "submitted",
    "branch_approved",
    "approved",
    "rejected",
    "picking",
    "packed",
    "shipped",
    "delivered",
    "closed",
    "cancelled",
  ])
  .optional();

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string; dir?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  // SPEC working-rule §6 — parse URL params with Zod at the trust boundary.
  const parsedStatus = StatusParam.safeParse(searchParams.status);
  const activeStatus: OrderStatusFilter | undefined = parsedStatus.success
    ? parsedStatus.data
    : undefined;

  const sort = parseSortParam<OrdersSortColumn>(
    { sort: searchParams.sort, dir: searchParams.dir },
    ORDERS_SORTABLE_COLUMNS,
    null,
  );

  const orders = await fetchVisibleOrders({
    statuses: activeStatus ? [activeStatus] : undefined,
    sort,
  });

  const preserve = { status: activeStatus ?? null };

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${orders.length.toLocaleString("nl-NL")} order${orders.length === 1 ? "" : "s"} visible to you`}
        actions={
          <Link
            href="/cart"
            className={cn(buttonVariants({ variant: "secondary", size: "default" }))}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            View cart
          </Link>
        }
      />
      <StatusFilterChips active={activeStatus ?? "all"} />
      {orders.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<ShoppingCart className="h-5 w-5" />}
            title={activeStatus ? `No ${activeStatus} orders` : "No orders yet"}
            description={
              activeStatus
                ? "Try a different status filter."
                : "Submitted and fulfilled orders you can see appear here."
            }
          />
        </div>
      ) : (
        <div className="px-gutter py-4">
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    basePath="/orders"
                    column="order_number"
                    current={sort}
                    preserveParams={preserve}
                    className="w-[160px]"
                  >
                    Number
                  </SortableHeader>
                  <SortableHeader
                    basePath="/orders"
                    column="branch"
                    current={sort}
                    preserveParams={preserve}
                    className="w-[90px]"
                  >
                    Branch
                  </SortableHeader>
                  <TableHead>Created by</TableHead>
                  <TableHead>Branch-approved by</TableHead>
                  <TableHead>HQ-approved by</TableHead>
                  <SortableHeader
                    basePath="/orders"
                    column="status"
                    current={sort}
                    preserveParams={preserve}
                    className="w-[130px]"
                  >
                    Status
                  </SortableHeader>
                  <SortableHeader
                    basePath="/orders"
                    column="submitted_at"
                    current={sort}
                    preserveParams={preserve}
                    className="w-[120px]"
                  >
                    Submitted
                  </SortableHeader>
                  <SortableHeader
                    basePath="/orders"
                    column="item_count"
                    current={sort}
                    preserveParams={preserve}
                    align="right"
                    className="w-[70px]"
                  >
                    Lines
                  </SortableHeader>
                  <SortableHeader
                    basePath="/orders"
                    column="total_gross_cents"
                    current={sort}
                    preserveParams={preserve}
                    align="right"
                    className="w-[110px]"
                  >
                    Total
                  </SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer">
                    <TableCell className="font-numeric">
                      <Link
                        href={`/orders/${o.id}`}
                        className="text-fg hover:underline"
                      >
                        {o.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-numeric">
                      {o.branch_code}
                    </TableCell>
                    <TableCell className="text-fg-muted truncate">
                      {o.created_by_email ?? "—"}
                    </TableCell>
                    <TableCell className="text-fg-muted truncate">
                      {o.branch_approved_by_email ?? "—"}
                    </TableCell>
                    <TableCell className="text-fg-muted truncate">
                      {o.approved_by_email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <OrderStatusPill status={o.status} />
                    </TableCell>
                    <TableCell className="text-fg-muted">
                      {formatDate(o.submitted_at ?? o.created_at)}
                    </TableCell>
                    <TableCell numeric>{o.item_count}</TableCell>
                    <TableCell numeric>
                      {formatCents(o.total_gross_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}
