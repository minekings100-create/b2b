import { redirect } from "next/navigation";
import Link from "next/link";
import { Box, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import { fetchActiveCart, resolveBranchForCart } from "@/lib/db/cart";
import { formatCents } from "@/lib/money";
import { CartLineRow } from "./_components/cart-line-row";
import { OutstandingBlockBanner, SubmitCart } from "./_components/submit-cart";

export const metadata = { title: "Cart" };

type SearchParams = {
  block?: string;
  count?: string;
  total?: string;
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!hasAnyRole(session.roles, ["branch_user", "branch_manager"])) {
    // Admins + packers don't have an ordering flow; send them home.
    redirect("/dashboard");
  }

  const branchId = await resolveBranchForCart(session.user.id);
  if (!branchId) {
    return (
      <>
        <PageHeader title="Cart" description="You're not assigned to a branch." />
        <div className="px-gutter py-10">
          <EmptyState
            icon={<ShoppingCart className="h-5 w-5" />}
            title="No branch assignment"
            description="Ask an administrator to assign you to a branch before placing orders."
          />
        </div>
      </>
    );
  }

  const cart = await fetchActiveCart(session.user.id, branchId);

  return (
    <>
      <PageHeader
        title="Cart"
        description={
          cart
            ? `Draft order for ${cart.branch_name} (${cart.branch_code})`
            : "Browse the catalog to start an order."
        }
        actions={
          <Link
            href="/catalog"
            className={cn(buttonVariants({ variant: "secondary", size: "default" }))}
          >
            <Box className="h-3.5 w-3.5" />
            Browse catalog
          </Link>
        }
      />

      {!cart || cart.items.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<ShoppingCart className="h-5 w-5" />}
            title="Your cart is empty"
            description="Open the catalog, pick a product, and use Add to cart."
          />
        </div>
      ) : (
        <div className="space-y-6 px-gutter py-6">
          {searchParams.block === "outstanding" && cart ? (
            <OutstandingBlockBanner
              orderId={cart.id}
              count={Number(searchParams.count ?? 0)}
              totalCents={Number(searchParams.total ?? 0)}
            />
          ) : null}
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[80px]">Unit</TableHead>
                  <TableHead className="w-[96px] text-right">Price</TableHead>
                  <TableHead className="w-[72px] text-right">VAT</TableHead>
                  <TableHead className="w-[160px]">Qty</TableHead>
                  <TableHead className="w-[110px] text-right">Line total</TableHead>
                  <TableHead className="w-[60px]">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.items.map((line) => (
                  <CartLineRow key={line.id} line={line} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface ring-1 ring-border p-4">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="neutral" dot={false}>
                {cart.items.length} line{cart.items.length === 1 ? "" : "s"}
              </Badge>
              <span className="text-fg-muted">
                Net{" "}
                <span className="font-numeric text-fg">
                  {formatCents(cart.total_net_cents)}
                </span>
              </span>
              <span className="text-fg-muted">
                VAT{" "}
                <span className="font-numeric text-fg">
                  {formatCents(cart.total_vat_cents)}
                </span>
              </span>
              <span className="text-fg">
                Total{" "}
                <span className="font-numeric font-semibold">
                  {formatCents(cart.total_gross_cents)}
                </span>
              </span>
            </div>
            <SubmitCart orderId={cart.id} />
          </div>
        </div>
      )}
    </>
  );
}
