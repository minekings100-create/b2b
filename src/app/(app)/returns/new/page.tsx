import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Archive } from "lucide-react";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import {
  fetchReturnableLinesForOrder,
} from "@/lib/db/returns";
import { fetchOrderDetail } from "@/lib/db/order-detail";

import { CreateReturnForm } from "./_components/create-return-form.client";

export const metadata = { title: "New return" };

const Params = z.object({ order_id: z.string().uuid() });

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: { order_id?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (
    !hasAnyRole(session.roles, [
      "branch_user",
      "branch_manager",
      "administration",
      "super_admin",
    ])
  ) {
    redirect("/returns");
  }

  const parsed = Params.safeParse({ order_id: searchParams.order_id ?? "" });
  if (!parsed.success) notFound();

  const order = await fetchOrderDetail(parsed.data.order_id);
  if (!order) notFound();
  if (order.status !== "delivered" && order.status !== "closed") {
    redirect(`/orders/${order.id}`);
  }
  const isMyBranch = session.roles.some(
    (r) => r.branch_id === order.branch_id,
  );
  if (!isAdmin(session.roles) && !isMyBranch) {
    redirect("/returns");
  }

  const lines = await fetchReturnableLinesForOrder(order.id);
  const anyReturnable = lines.some((l) => l.qty_remaining > 0);

  return (
    <>
      <PageHeader
        title={`Return against ${order.order_number}`}
        description={`${order.branch_code} · ${order.branch_name}`}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: order.order_number, href: `/orders/${order.id}` },
          { label: "Return" },
        ]}
        actions={
          <Link
            href={`/orders/${order.id}`}
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />

      <div className="px-gutter py-6">
        {!anyReturnable ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" />}
            title="Nothing left to return"
            description="Every approved line has already been fully returned."
          />
        ) : (
          <CreateReturnForm
            orderId={order.id}
            lines={lines.filter((l) => l.qty_remaining > 0)}
          />
        )}
      </div>
    </>
  );
}
