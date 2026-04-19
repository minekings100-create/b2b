import { CheckCircle2, FileText, Inbox } from "lucide-react";

import { StatCard, StatCardGrid } from "@/components/app/stat-card";
import {
  countOrdersByStatus,
  recentBranchApprovedForHq,
  sumInvoicesByStatus,
} from "@/lib/db/dashboard";
import { formatCents } from "@/lib/money";

import { RecentOrdersPanel } from "./_shared";

/**
 * Phase 7a — HQ Manager dashboard.
 *
 * HQ owns step-2 cross-branch. Primary stat is "awaiting HQ"; we also
 * surface the step-1 backlog (read-only context — HQ can't act there
 * per the SPEC §8.2 non-substitution rule, but seeing branch managers
 * are behind helps decide who to nudge).
 */
export async function HqManagerDashboard() {
  const [awaitingHq, awaitingBranch, openInvoices, overdue, recent] =
    await Promise.all([
      countOrdersByStatus(["branch_approved"]),
      countOrdersByStatus(["submitted"]),
      sumInvoicesByStatus(["issued", "overdue"]),
      sumInvoicesByStatus(["overdue"]),
      recentBranchApprovedForHq(5),
    ]);

  return (
    <div className="space-y-6">
      <StatCardGrid>
        <StatCard
          label="Awaiting HQ"
          value={String(awaitingHq.count)}
          sublabel={
            awaitingHq.count > 0
              ? "Step 2 — your queue, oldest first"
              : "Inbox zero"
          }
          icon={<Inbox className="h-4 w-4" />}
          href="/approvals"
          emphasis={awaitingHq.count > 0 ? "warning" : "neutral"}
          testId="stat-awaiting-hq"
        />
        <StatCard
          label="Awaiting branch"
          value={String(awaitingBranch.count)}
          sublabel="Step 1 — branch managers' queue"
          icon={<CheckCircle2 className="h-4 w-4" />}
          href="/approvals"
          testId="stat-awaiting-branch"
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
          href="/invoices?status=overdue"
          emphasis={overdue.count > 0 ? "warning" : "neutral"}
          testId="stat-overdue"
        />
      </StatCardGrid>

      <RecentOrdersPanel
        title="Awaiting HQ approval"
        rows={recent}
        emptyTitle="HQ queue is clear"
        emptyDescription="Branch-approved orders will appear here for your review."
      />
    </div>
  );
}
