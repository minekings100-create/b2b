import { Package, Truck } from "lucide-react";

import { StatCard, StatCardGrid } from "@/components/app/stat-card";
import {
  countOrdersByStatus,
  recentApprovedForPacking,
} from "@/lib/db/dashboard";

import { RecentOrdersPanel } from "./_shared";

/**
 * Phase 7a — packer dashboard. Cross-branch counts (RLS narrows
 * packers to fulfilment statuses already; the queries here mirror
 * the /pack queue surface).
 */
export async function PackerDashboard() {
  const [toPack, picking, recent] = await Promise.all([
    countOrdersByStatus(["approved"]),
    countOrdersByStatus(["picking"]),
    recentApprovedForPacking(5),
  ]);

  return (
    <div className="space-y-6">
      <StatCardGrid>
        <StatCard
          label="To pack"
          value={String(toPack.count)}
          sublabel={
            toPack.count > 0 ? "Approved orders waiting" : "Nothing to pack"
          }
          icon={<Package className="h-4 w-4" />}
          href="/pack"
          testId="stat-to-pack"
        />
        <StatCard
          label="In picking"
          value={String(picking.count)}
          sublabel="Started but not yet packed"
          icon={<Truck className="h-4 w-4" />}
          href="/pack"
          testId="stat-in-picking"
        />
      </StatCardGrid>

      <RecentOrdersPanel
        title="Pack queue"
        rows={recent}
        emptyTitle="Pack queue is clear"
        emptyDescription="Approved orders will appear here as soon as HQ signs off."
      />
    </div>
  );
}
