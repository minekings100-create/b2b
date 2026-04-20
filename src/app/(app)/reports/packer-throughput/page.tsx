import { redirect } from "next/navigation";
import { ChevronLeft, Package } from "lucide-react";
import Link from "next/link";

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
import { getUserWithRoles } from "@/lib/auth/session";
import { canSeeReport } from "@/lib/auth/reports";
import { fetchPackerThroughput } from "@/lib/db/reports";

import { WindowPicker } from "../_components/window-picker";
import { parseWindow } from "../_lib/window";

export const metadata = { title: "Packer throughput" };

export default async function PackerThroughputPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!canSeeReport("packer-throughput", session.roles)) redirect("/dashboard");

  const w = parseWindow(searchParams);
  const rows = await fetchPackerThroughput(w);
  const csvHref = `/api/reports/packer-throughput/csv?from=${w.from}&to=${w.to}`;

  const totalPallets = rows.reduce((a, r) => a + r.pallet_count, 0);

  return (
    <>
      <PageHeader
        title="Packer throughput"
        description="Pallets packed per packer over the window. One row per user (plus a '(system)' row for pallets not attributed to a specific packer)."
        breadcrumbs={[
          { label: "Reports", href: "/reports" },
          { label: "Packer throughput" },
        ]}
        actions={
          <Link
            href="/reports"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        }
      />
      <div className="space-y-4 px-gutter py-6">
        <WindowPicker from={w.from} to={w.to} csvHref={csvHref} />
        {rows.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No pallets packed in this window"
            description="Try widening the From/To dates."
          />
        ) : (
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packer</TableHead>
                  <TableHead className="w-[140px] text-right">
                    Pallets
                  </TableHead>
                  <TableHead className="w-[140px] text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell>
                      <div className="font-medium">
                        {r.full_name ?? r.email}
                      </div>
                      {r.full_name ? (
                        <div className="text-xs text-fg-muted">{r.email}</div>
                      ) : null}
                    </TableCell>
                    <TableCell numeric>{r.pallet_count}</TableCell>
                    <TableCell numeric className="text-fg-muted">
                      {r.order_count}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell className="text-right text-fg-muted">
                    Total
                  </TableCell>
                  <TableCell numeric data-testid="packer-total">
                    {totalPallets}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
