import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { OrderStatusPill } from "@/components/app/order-status-pill";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/roles";
import { fetchPickList } from "@/lib/db/packing";

import { ScanInput } from "./_components/scan-input.client";
import { PalletPanel } from "./_components/pallet-panel.client";
import { CompletePackButton } from "./_components/complete-pack-button.client";
import { PickList } from "./_components/pick-list.client";

export const metadata = { title: "Pick & pack" };

/**
 * Phase 4 — per-order pick & pack workspace.
 *
 * Left column: scan input + line list + complete button.
 * Right column: pallet side panel.
 *
 * Packer-first layout: chunky scan input, 2-col on desktop, stacked on
 * tablet/mobile. SPEC §4 specifies the packer view goes denser-down /
 * touch-targets-up — matches the 48px / 64px sizes here.
 */
export default async function PickPackPage({
  params,
}: {
  params: { orderId: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (
    !hasAnyRole(session.roles, ["packer", "administration", "super_admin"])
  ) {
    redirect("/dashboard");
  }

  const detail = await fetchPickList(params.orderId);
  if (!detail) notFound();

  // Only `approved` / `picking` orders are actionable here. For
  // already-packed / shipped / delivered orders, flip to a read-only
  // summary so the packer can still see the PDFs + pallet breakdown.
  const isActionable =
    detail.status === "approved" || detail.status === "picking";

  const totalApproved = detail.lines.reduce(
    (sum, l) => sum + l.quantity_approved,
    0,
  );
  const totalPacked = detail.lines.reduce(
    (sum, l) => sum + l.quantity_packed,
    0,
  );
  const underPacked = detail.lines.filter(
    (l) => l.quantity_packed < l.quantity_approved,
  ).length;
  const openPallets = detail.pallets.filter((p) => p.status === "open").length;
  const canComplete =
    isActionable &&
    detail.status === "picking" &&
    underPacked === 0 &&
    openPallets === 0;
  const blockReason =
    detail.status !== "picking"
      ? "Scan at least one item to start picking."
      : underPacked > 0
        ? `${underPacked} line${underPacked === 1 ? "" : "s"} still under-packed.`
        : openPallets > 0
          ? `${openPallets} pallet${openPallets === 1 ? " is" : "s are"} still open — close before completing.`
          : null;

  return (
    <>
      <PageHeader
        title={`Pack ${detail.order_number}`}
        description={`${detail.branch_code} · ${detail.branch_name}`}
        actions={
          <>
            <Link
              href="/pack"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-border hover:bg-surface-elevated hover:text-fg"
            >
              <ArrowLeft className="h-3 w-3" />
              Queue
            </Link>
            <a
              href={`/api/pdf/pick-list/${detail.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-elevated px-2.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-border hover:text-fg"
              data-testid="print-picklist-link"
            >
              <Printer className="h-3 w-3" />
              Pick list PDF
            </a>
            <OrderStatusPill status={detail.status} />
          </>
        }
      />
      <div className="flex flex-col gap-6 px-gutter pb-12 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          {isActionable ? <ScanInput orderId={detail.id} /> : null}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
              <span>
                {detail.lines.length} line
                {detail.lines.length === 1 ? "" : "s"} ·{" "}
                <span className="font-numeric">
                  {totalPacked} / {totalApproved}
                </span>{" "}
                packed
              </span>
              <span>Sorted by warehouse location</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Packed / Approved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <PickList
                  lines={detail.lines}
                  orderId={detail.id}
                  readOnly={!isActionable}
                />
              </TableBody>
            </Table>
          </div>
          {isActionable ? (
            <CompletePackButton
              orderId={detail.id}
              canComplete={canComplete}
              blockReason={blockReason}
            />
          ) : null}
        </div>
        <PalletPanel orderId={detail.id} pallets={detail.pallets} />
      </div>
    </>
  );
}
