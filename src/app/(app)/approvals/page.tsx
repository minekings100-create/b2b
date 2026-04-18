import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { OrderStatusPill } from "@/components/app/order-status-pill";
import { cn } from "@/lib/utils";
import { getUserWithRoles } from "@/lib/auth/session";
import {
  hasAnyRole,
  isAdmin,
  isHqManager,
} from "@/lib/auth/roles";
import {
  fetchApprovalQueue,
  type ApprovalQueueRow,
} from "@/lib/db/approvals";
import { formatCents } from "@/lib/money";
import type { Database } from "@/lib/supabase/types";

type Status = Database["public"]["Enums"]["order_status"];

export const metadata = { title: "Approvals" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TabParam = z.enum(["hq", "branch", "all"]).optional();

/**
 * Role-aware approval queue (3.2.2b).
 *
 * Branch Manager: single-tab view of `submitted` orders for their branch.
 * HQ Manager / Admin: tabbed view —
 *   - "Awaiting HQ" (default)   = `branch_approved`, cross-branch
 *   - "Awaiting branch"         = `submitted`, cross-branch (read-only)
 *   - "All pending"             = both, cross-branch
 *
 * Tab is URL-driven (`?tab=hq|branch|all`) so the back button works and the
 * default landing for HQ is the queue they actually own.
 */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const admin = isAdmin(session.roles);
  const hq = isHqManager(session.roles);
  const branchMgr = hasAnyRole(session.roles, ["branch_manager"]);
  if (!admin && !hq && !branchMgr) redirect("/dashboard");

  // HQ + admin see the tabbed view; pure branch managers see only step 1.
  const showTabs = admin || hq;

  if (!showTabs) {
    const rows = await fetchApprovalQueue(["submitted"]);
    return renderQueue({
      title: "Branch approval queue",
      description: `${rows.length} submitted order${rows.length === 1 ? "" : "s"} awaiting your decision`,
      emptyTitle: "Nothing to review",
      emptyDescription:
        "Submitted orders for your branch appear here, oldest first.",
      rows,
      tab: "branch",
    });
  }

  const parsedTab = TabParam.safeParse(searchParams.tab);
  const tab: "hq" | "branch" | "all" = parsedTab.success
    ? (parsedTab.data ?? "hq")
    : "hq";

  const statusByTab: Record<"hq" | "branch" | "all", Status[]> = {
    hq: ["branch_approved"],
    branch: ["submitted"],
    all: ["submitted", "branch_approved"],
  };

  const rows = await fetchApprovalQueue(statusByTab[tab]);

  // Per-tab counts so each tab pill carries a number without the user
  // having to switch to find out. Cheap because RLS already restricts
  // the result set.
  const [stepOneRows, stepTwoRows] =
    tab === "all"
      ? [
          rows.filter((r) => r.status === "submitted"),
          rows.filter((r) => r.status === "branch_approved"),
        ]
      : await Promise.all([
          tab === "branch"
            ? Promise.resolve(rows)
            : fetchApprovalQueue(["submitted"]),
          tab === "hq"
            ? Promise.resolve(rows)
            : fetchApprovalQueue(["branch_approved"]),
        ]);

  const counts = {
    hq: stepTwoRows.length,
    branch: stepOneRows.length,
    all: stepOneRows.length + stepTwoRows.length,
  };

  return (
    <>
      <PageHeader
        title="Approval queue"
        description={
          tab === "hq"
            ? "Orders awaiting HQ second-step approval, oldest first."
            : tab === "branch"
              ? "Orders awaiting branch first-step approval — read-only here; the branch manager owns this decision."
              : "All orders awaiting either approval step."
        }
      />
      <ApprovalTabs active={tab} counts={counts} />
      {rows.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Nothing to review"
            description={
              tab === "hq"
                ? "Branch-approved orders awaiting HQ sign-off appear here."
                : tab === "branch"
                  ? "Submitted orders awaiting a branch manager appear here."
                  : "All pending approvals across both steps appear here."
            }
          />
        </div>
      ) : (
        <QueueTable rows={rows} showStatus={tab === "all"} showBranchApprover={tab !== "branch"} />
      )}
    </>
  );
}

function ApprovalTabs({
  active,
  counts,
}: {
  active: "hq" | "branch" | "all";
  counts: { hq: number; branch: number; all: number };
}) {
  const tabs: Array<{ value: "hq" | "branch" | "all"; label: string }> = [
    { value: "hq", label: "Awaiting HQ" },
    { value: "branch", label: "Awaiting branch" },
    { value: "all", label: "All pending" },
  ];
  return (
    <nav
      aria-label="Approval queue tabs"
      className="flex flex-wrap items-center gap-1.5 px-gutter pt-2"
    >
      {tabs.map((t) => {
        const isActive = active === t.value;
        const href = t.value === "hq" ? "/approvals" : `/approvals?tab=${t.value}`;
        return (
          <Link
            key={t.value}
            href={href}
            data-active={isActive || undefined}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors duration-150",
              isActive
                ? "bg-accent text-accent-fg ring-accent shadow-sm"
                : "bg-surface text-fg-muted ring-border hover:bg-surface-elevated hover:text-fg",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[10px] font-numeric",
                isActive
                  ? "bg-white/15 text-accent-fg"
                  : "bg-surface-elevated text-fg-muted",
              )}
            >
              {counts[t.value]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function QueueTable({
  rows,
  showStatus,
  showBranchApprover,
}: {
  rows: ApprovalQueueRow[];
  showStatus: boolean;
  showBranchApprover: boolean;
}) {
  return (
    <div className="px-gutter py-4">
      <div className="overflow-hidden rounded-lg ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Number</TableHead>
              <TableHead className="w-[90px]">Branch</TableHead>
              <TableHead>Submitted by</TableHead>
              {showBranchApprover ? (
                <TableHead>Branch-approved by</TableHead>
              ) : null}
              {showStatus ? (
                <TableHead className="w-[140px]">Status</TableHead>
              ) : null}
              <TableHead className="w-[160px]">Waiting since</TableHead>
              <TableHead className="w-[70px] text-right">Lines</TableHead>
              <TableHead className="w-[120px] text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
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
                  <Badge variant="neutral" dot={false}>
                    {o.branch_code}
                  </Badge>
                </TableCell>
                <TableCell className="text-fg-muted truncate">
                  {o.created_by_email ?? "—"}
                </TableCell>
                {showBranchApprover ? (
                  <TableCell className="text-fg-muted truncate">
                    {o.branch_approved_by_email ?? "—"}
                  </TableCell>
                ) : null}
                {showStatus ? (
                  <TableCell>
                    <OrderStatusPill status={o.status} />
                  </TableCell>
                ) : null}
                <TableCell className="text-fg-muted">
                  {formatDate(
                    o.status === "branch_approved"
                      ? o.branch_approved_at
                      : o.submitted_at,
                  )}
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
  );
}

function renderQueue(opts: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  rows: ApprovalQueueRow[];
  tab: "hq" | "branch" | "all";
}) {
  return (
    <>
      <PageHeader title={opts.title} description={opts.description} />
      {opts.rows.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title={opts.emptyTitle}
            description={opts.emptyDescription}
          />
        </div>
      ) : (
        <QueueTable
          rows={opts.rows}
          showStatus={opts.tab === "all"}
          showBranchApprover={opts.tab !== "branch"}
        />
      )}
    </>
  );
}
