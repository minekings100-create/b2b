import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReturnStatusPill } from "@/components/app/return-status-pill";
import { ActivityTimeline } from "@/components/app/activity-timeline";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { fetchReturnDetail } from "@/lib/db/returns";

import { ReturnActions } from "./_components/return-actions.client";

export const metadata = { title: "Return" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

export default async function ReturnDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");

  const ret = await fetchReturnDetail(params.id);
  if (!ret) notFound();

  const admin = isAdmin(session.roles);

  return (
    <>
      <PageHeader
        title={`Return ${ret.rma_number}`}
        description={`${ret.branch_code} · ${ret.branch_name} · order ${ret.order_number ?? "—"}`}
        breadcrumbs={[
          { label: "Returns", href: "/returns" },
          { label: ret.rma_number },
        ]}
        actions={
          <>
            <Link
              href="/returns"
              className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            <ReturnStatusPill status={ret.status} size="lg" />
          </>
        }
      />

      <div className="space-y-6 px-gutter py-6">
        {ret.status === "rejected" && ret.notes ? (
          <section className="rounded-lg bg-danger-subtle/40 ring-1 ring-inset ring-danger/30 p-4 space-y-1">
            <p className="label-meta text-danger-subtle-fg">
              Rejection reason
            </p>
            <p className="text-sm text-fg">{ret.notes}</p>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <Meta
            label="Requested by"
            value={ret.requested_by_email ?? "—"}
          />
          <Meta
            label="Requested"
            value={formatDate(ret.requested_at)}
          />
          <Meta
            label="Order"
            value={
              ret.order_number
                ? `${ret.order_number}`
                : "—"
            }
            mono
          />
          <Meta
            label="Processed"
            value={formatDate(ret.processed_at)}
          />
        </section>

        {ret.reason ? (
          <section className="rounded-md bg-surface p-3 ring-1 ring-border">
            <p className="label-meta mb-1">Branch reason</p>
            <p className="text-sm text-fg">{ret.reason}</p>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Items</h2>
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[80px] text-right">Qty</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ret.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-numeric text-fg-muted">
                      {i.sku}
                    </TableCell>
                    <TableCell>{i.name}</TableCell>
                    <TableCell numeric>{i.quantity}</TableCell>
                    <TableCell className="capitalize">
                      {i.condition.replace("_", " ")}
                    </TableCell>
                    <TableCell className="capitalize">
                      {i.resolution
                        ? i.resolution.replace("_", " ")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {admin ? (
          <section className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight">
              Admin actions
            </h2>
            <ReturnActions
              returnId={ret.id}
              status={ret.status}
              items={ret.items}
            />
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Activity</h2>
          <ActivityTimeline
            entries={ret.timeline}
            emptyHint="No activity recorded yet."
          />
        </section>
      </div>
    </>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="label-meta">{label}</p>
      <p
        className={
          mono ? "text-sm font-numeric text-fg" : "text-sm text-fg"
        }
      >
        {value}
      </p>
    </div>
  );
}
