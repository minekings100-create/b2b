import { BarChart3, FileText, Inbox, ShoppingCart } from "lucide-react";

import { StatCard, StatCardGrid } from "@/components/app/stat-card";
import {
  countOrdersByStatus,
  recentOrders,
  sumInvoicesByStatus,
  sumMtdPaid,
} from "@/lib/db/dashboard";
import { formatCents } from "@/lib/money";

import { RecentOrdersPanel } from "./_shared";

/**
 * Phase 7a — admin / super_admin dashboard. Cross-branch view.
 */
export async function AdminDashboard() {
  const [openOrders, openInvoices, overdue, mtd, recent] = await Promise.all([
    countOrdersByStatus([
      "submitted",
      "branch_approved",
      "approved",
      "picking",
      "packed",
      "shipped",
    ]),
    sumInvoicesByStatus(["issued", "overdue"]),
    sumInvoicesByStatus(["overdue"]),
    sumMtdPaid(),
    recentOrders(5),
  ]);

  return (
    <div className="space-y-6">
      <StatCardGrid>
        <StatCard
          label="Orders in flight"
          value={String(openOrders.count)}
          sublabel="Cross-branch — submitted through shipped"
          icon={<ShoppingCart className="h-4 w-4" />}
          href="/orders"
          testId="stat-open-orders"
        />
        <StatCard
          label="Open invoices"
          value={String(openInvoices.count)}
          sublabel={
            openInvoices.count > 0
              ? `${formatCents(openInvoices.total_cents)} outstanding`
              : "All clear"
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
              : "None"
          }
          icon={<Inbox className="h-4 w-4" />}
          href="/invoices?status=overdue"
          emphasis={overdue.count > 0 ? "warning" : "neutral"}
          testId="stat-overdue"
        />
        <StatCard
          label="MTD paid"
          value={formatCents(mtd.total_cents)}
          sublabel={`${mtd.count} invoice${mtd.count === 1 ? "" : "s"} this month`}
          icon={<BarChart3 className="h-4 w-4" />}
          href="/invoices?status=paid"
          testId="stat-mtd"
        />
      </StatCardGrid>

      <RecentOrdersPanel
        title="Recent orders (cross-branch)"
        rows={recent}
        emptyTitle="No orders yet"
        emptyDescription="As branches submit orders they'll appear here."
      />
    </div>
  );
}
