import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUserWithRoles } from "@/lib/auth/session";
import { fetchVisibleOrders } from "@/lib/db/orders-list";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Orders" };

const statusVariant: Record<
  string,
  "neutral" | "accent" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  submitted: "accent",
  approved: "success",
  rejected: "danger",
  picking: "warning",
  packed: "warning",
  shipped: "accent",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function OrdersPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const orders = await fetchVisibleOrders();

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
      {orders.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<ShoppingCart className="h-5 w-5" />}
            title="No orders yet"
            description="Submitted and fulfilled orders you can see appear here."
          />
        </div>
      ) : (
        <div className="px-gutter py-4">
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Number</TableHead>
                  <TableHead className="w-[90px]">Branch</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                  <TableHead className="w-[120px]">Submitted</TableHead>
                  <TableHead className="w-[70px] text-right">Lines</TableHead>
                  <TableHead className="w-[110px] text-right">Total</TableHead>
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
                    <TableCell>
                      <Badge variant={statusVariant[o.status] ?? "neutral"}>
                        {o.status.replace(/_/g, " ")}
                      </Badge>
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
