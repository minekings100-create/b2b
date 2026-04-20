import { redirect } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";

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
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { fetchPackQueue, PACK_CLAIM_TTL_MINUTES } from "@/lib/db/packing";
import { cn } from "@/lib/utils";

import { ClaimButtons } from "./_components/claim-buttons.client";
import { RushBadge } from "./_components/rush-badge";

export const metadata = { title: "Pack queue" };

/**
 * Phase 4 — packer queue.
 *
 * Lists every order in `approved` or `picking` status, oldest
 * `approved_at` first (FIFO). RLS narrows packers to fulfilment-stage
 * orders; admin / super_admin see the same list cross-branch.
 */
export default async function PackQueuePage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (
    !hasAnyRole(session.roles, ["packer", "administration", "super_admin"])
  ) {
    redirect("/dashboard");
  }

  const queue = await fetchPackQueue();
  const myUid = session.user.id;
  const admin = isAdmin(session.roles);

  return (
    <>
      <PageHeader
        title="Pack queue"
        description={`Approved orders awaiting picking. Rushed orders float to the top; otherwise FIFO by approval time. Claims auto-release after ${PACK_CLAIM_TTL_MINUTES} minutes of inactivity.`}
      />
      <div className="px-gutter pb-12">
        {queue.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Nothing to pack"
            description="When an order is HQ-approved it will appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Order</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Packed / Approved</TableHead>
                <TableHead className="text-right">Approved at</TableHead>
                <TableHead className="w-[260px] text-right">Claim</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row) => {
                const mine = row.claimed_by_user_id === myUid;
                const claimedByOther =
                  row.claimed_by_user_id !== null && !mine;
                return (
                  <TableRow
                    key={row.id}
                    data-rush={row.is_rush ? "true" : undefined}
                    data-claim-state={
                      mine ? "mine" : claimedByOther ? "other" : "available"
                    }
                    className={cn(
                      "transition-colors",
                      claimedByOther
                        ? "opacity-60"
                        : "hover:bg-surface-elevated",
                    )}
                  >
                    <TableCell className="font-numeric font-medium">
                      <div className="flex items-center gap-2">
                        {row.is_rush ? <RushBadge /> : null}
                        <Link
                          href={`/pack/${row.id}`}
                          className="text-fg hover:underline"
                          aria-disabled={claimedByOther || undefined}
                          // Rows claimed by someone else stay navigable
                          // for read-only inspection; the pack page's own
                          // claim guard blocks packing actions.
                        >
                          {row.order_number}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-fg">{row.branch_code}</span>
                      <span className="ml-2 text-fg-muted">{row.branch_name}</span>
                    </TableCell>
                    <TableCell>
                      <OrderStatusPill status={row.status} />
                    </TableCell>
                    <TableCell numeric>{row.item_count}</TableCell>
                    <TableCell numeric>
                      <span
                        className={cn(
                          row.total_qty_packed === row.total_qty_approved &&
                            row.total_qty_approved > 0
                            ? "text-success"
                            : "text-fg-muted",
                        )}
                      >
                        {row.total_qty_packed}
                      </span>
                      <span className="text-fg-subtle"> / </span>
                      <span>{row.total_qty_approved}</span>
                    </TableCell>
                    <TableCell numeric className="text-fg-muted">
                      {new Date(row.approved_at).toLocaleString("nl-NL", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Europe/Amsterdam",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <ClaimButtons
                          orderId={row.id}
                          orderNumber={row.order_number}
                          mine={mine}
                          claimedByEmail={row.claimed_by_email}
                          isAdmin={admin}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
