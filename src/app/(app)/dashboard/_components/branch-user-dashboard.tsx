import { FileText, Inbox, ShoppingCart } from "lucide-react";

import { StatCard, StatCardGrid } from "@/components/app/stat-card";
import {
  countOrdersByStatus,
  recentOrders,
  sumInvoicesByStatus,
} from "@/lib/db/dashboard";
import { formatCents } from "@/lib/money";

import { RecentOrdersPanel } from "./_shared";

/**
 * Phase 7a — branch user dashboard.
 *
 * Stats: open orders (everything pre-fulfilment), open invoices,
 * overdue invoices. Tail: 5 most-recent orders for the branch (RLS
 * scopes to the user's branch).
 */
export async function BranchUserDashboard() {
  const [openOrders, openInvoices, overdue, recent] = await Promise.all([
    countOrdersByStatus([
      "draft",
      "submitted",
      "branch_approved",
      "approved",
      "picking",
      "packed",
      "shipped",
    ]),
    sumInvoicesByStatus(["issued", "overdue"]),
    sumInvoicesByStatus(["overdue"]),
    recentOrders(5),
  ]);

  return (
    <div className="space-y-6">
      <StatCardGrid>
        <StatCard
          label="Open orders"
          value={String(openOrders.count)}
          sublabel="In flight from draft through ship"
          icon={<ShoppingCart className="h-4 w-4" />}
          href="/orders"
          testId="stat-open-orders"
        />
        <StatCard
          label="Open invoices"
          value={String(openInvoices.count)}
          sublabel={
            openInvoices.count > 0
              ? `${formatCents(openInvoices.total_cents)} total`
              : "Nothing outstanding"
          }
          icon={<FileText className="h-4 w-4" />}
          href="/invoices"
          testId="stat-open-invoices"
        />
        <StatCard
          label="Overdue"
          value={String(overdue.count)}
          sublabel={
            overdue.count > 0
              ? `${formatCents(overdue.total_cents)} past due`
              : "All clear"
          }
          icon={<Inbox className="h-4 w-4" />}
          href="/invoices?status=overdue"
          emphasis={overdue.count > 0 ? "warning" : "neutral"}
          testId="stat-overdue"
        />
      </StatCardGrid>

      <RecentOrdersPanel
        title="Your branch's recent orders"
        rows={recent}
        emptyTitle="No orders yet"
        emptyDescription="Submitted orders for your branch will appear here."
      />
    </div>
  );
}
