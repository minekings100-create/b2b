import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox } from "lucide-react";
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
import { getUserWithRoles } from "@/lib/auth/session";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { fetchApprovalQueue } from "@/lib/db/approvals";
import { formatCents } from "@/lib/money";

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

export default async function ApprovalsPage() {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles) && !hasAnyRole(session.roles, ["branch_manager"])) {
    redirect("/dashboard");
  }

  const rows = await fetchApprovalQueue();

  return (
    <>
      <PageHeader
        title="Approval queue"
        description={`${rows.length} submitted order${rows.length === 1 ? "" : "s"} awaiting decision`}
      />
      {rows.length === 0 ? (
        <div className="px-gutter py-10">
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Nothing to review"
            description="Submitted orders for your branch will appear here, oldest first."
          />
        </div>
      ) : (
        <div className="px-gutter py-4">
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Number</TableHead>
                  <TableHead className="w-[90px]">Branch</TableHead>
                  <TableHead>Submitted by</TableHead>
                  <TableHead className="w-[160px]">Submitted</TableHead>
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
                    <TableCell className="text-fg-muted">
                      {formatDate(o.submitted_at)}
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
      )}
    </>
  );
}
