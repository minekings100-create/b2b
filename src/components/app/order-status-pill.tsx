import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for order-status → Badge variant mapping. SPEC §4
 * limits status colour to neutral / accent / success / warning / danger so
 * the §11 lifecycle is mapped onto those tokens here. The `prominent` size
 * is used at the top of /orders/[id]; default size matches list rows.
 */

export type OrderStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "picking"
  | "packed"
  | "shipped"
  | "delivered"
  | "closed"
  | "cancelled";

export const ORDER_STATUS_VARIANT: Record<
  OrderStatus,
  "neutral" | "accent" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  submitted: "accent",
  approved: "success",
  rejected: "danger",
  picking: "warning",
  packed: "accent",
  shipped: "accent",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
};

export function OrderStatusPill({
  status,
  size = "sm",
  className,
}: {
  status: OrderStatus | string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const variant = ORDER_STATUS_VARIANT[status as OrderStatus] ?? "neutral";
  return (
    <Badge
      variant={variant}
      className={cn(
        size === "lg" &&
          "px-2.5 py-1 text-[12px] tracking-tight",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
