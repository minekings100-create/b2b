import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { History } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserWithRoles } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import {
  fetchAuditLogPage,
  resolveActorIdByEmail,
  type AuditLogRow,
} from "@/lib/db/audit-log";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

/**
 * Phase 7b-2a — admin audit-log viewer with filters + pagination.
 *
 * RLS (20260417000003) already scopes the read to super_admin +
 * administration + self. We double-gate at the page layer with
 * `isAdmin` so branch users don't land on a route that returns an
 * empty table.
 *
 * All filters are URL-driven (shareable + back-button friendly). Each
 * input is Zod-parsed at the trust boundary, same pattern as `/orders`'
 * status filter chips.
 */

const FiltersSchema = z.object({
  entity_type: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(60).optional(),
  actor_email: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .email()
    .optional()
    .or(z.literal("")),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

type ResolvedFilters = {
  entity_type?: string;
  action?: string;
  actor_email?: string;
  since?: string;
  until?: string;
  page: number;
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getUserWithRoles();
  if (!session) redirect("/login");
  if (!isAdmin(session.roles)) redirect("/dashboard");

  const flattened: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v.length > 0) flattened[k] = v;
  }

  const parsed = FiltersSchema.safeParse(flattened);
  const filters: ResolvedFilters = parsed.success
    ? {
        entity_type: parsed.data.entity_type || undefined,
        action: parsed.data.action || undefined,
        actor_email: parsed.data.actor_email || undefined,
        since: parsed.data.since || undefined,
        until: parsed.data.until || undefined,
        page: parsed.data.page,
      }
    : { page: 1 };

  // Resolve actor_email → actor_user_id server-side so the DB query
  // stays an indexed equality match on actor_user_id.
  let actorUid: string | null | undefined = undefined;
  if (filters.actor_email) {
    actorUid = await resolveActorIdByEmail(filters.actor_email);
  }

  // If the user asked for a non-existent email, short-circuit to an
  // empty page rather than returning the full unfiltered set.
  const noMatchUser = filters.actor_email && actorUid === null;

  const page = noMatchUser
    ? { rows: [] as AuditLogRow[], actor_email: {}, total: 0 }
    : await fetchAuditLogPage({
        entity_type: filters.entity_type,
        action: filters.action,
        actor_user_id: actorUid ?? undefined,
        since: filters.since,
        until: filters.until,
        limit: PAGE_SIZE,
        offset: (filters.page - 1) * PAGE_SIZE,
      });

  const totalPages = Math.max(1, Math.ceil(page.total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every mutation on orders, invoices, returns, catalog items, payments, and more."
      />
      <div className="space-y-4 px-gutter py-6">
        <FilterBar filters={filters} total={page.total} />
        {page.rows.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No audit rows"
            description={
              noMatchUser
                ? `No user with email "${filters.actor_email}" — check spelling.`
                : "No audit rows match the current filters."
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg ring-1 ring-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">When</TableHead>
                    <TableHead className="w-[180px]">Actor</TableHead>
                    <TableHead className="w-[140px]">Entity</TableHead>
                    <TableHead className="w-[160px]">Action</TableHead>
                    <TableHead>Entity id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((r) => (
                    <AuditRow
                      key={r.id}
                      row={r}
                      actorEmail={
                        r.actor_user_id ? page.actor_email[r.actor_user_id] : null
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination filters={filters} currentPage={filters.page} totalPages={totalPages} />
          </>
        )}
      </div>
    </>
  );
}

function AuditRow({
  row,
  actorEmail,
}: {
  row: AuditLogRow;
  actorEmail: string | null | undefined;
}) {
  return (
    <TableRow data-action={row.action} data-entity-type={row.entity_type}>
      <TableCell className="font-numeric text-xs">
        {formatTimestamp(row.created_at)}
      </TableCell>
      <TableCell className="text-sm">
        {actorEmail ?? (
          <span className="text-fg-subtle">
            {row.actor_user_id ? "(user)" : "system"}
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm text-fg-muted">
        {row.entity_type}
      </TableCell>
      <TableCell className="text-sm font-medium">{row.action}</TableCell>
      <TableCell className="font-mono text-[11px] text-fg-subtle">
        {row.entity_id}
      </TableCell>
    </TableRow>
  );
}

function formatTimestamp(iso: string): string {
  // Render as YYYY-MM-DD HH:mm in the caller's locale — keeps the
  // column narrow and grep-friendly.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function FilterBar({
  filters,
  total,
}: {
  filters: ResolvedFilters;
  total: number;
}) {
  return (
    <form
      method="get"
      className="rounded-lg bg-surface p-4 ring-1 ring-border"
      aria-label="Filter audit log"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[160px]">
          <Label htmlFor="f-entity">Entity type</Label>
          <Input
            id="f-entity"
            name="entity_type"
            defaultValue={filters.entity_type ?? ""}
            placeholder="order"
            className="mt-1.5"
          />
        </div>
        <div className="w-[200px]">
          <Label htmlFor="f-action">Action</Label>
          <Input
            id="f-action"
            name="action"
            defaultValue={filters.action ?? ""}
            placeholder="approve"
            className="mt-1.5"
          />
        </div>
        <div className="w-[240px]">
          <Label htmlFor="f-actor">Actor email</Label>
          <Input
            id="f-actor"
            name="actor_email"
            type="email"
            defaultValue={filters.actor_email ?? ""}
            placeholder="user@example.nl"
            className="mt-1.5"
          />
        </div>
        <div className="w-[150px]">
          <Label htmlFor="f-since">Since</Label>
          <Input
            id="f-since"
            name="since"
            type="date"
            defaultValue={filters.since ?? ""}
            className="mt-1.5 font-numeric"
          />
        </div>
        <div className="w-[150px]">
          <Label htmlFor="f-until">Until</Label>
          <Input
            id="f-until"
            name="until"
            type="date"
            defaultValue={filters.until ?? ""}
            className="mt-1.5 font-numeric"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit">Apply</Button>
          <Link
            href="/admin/audit-log"
            className="text-xs text-fg-muted hover:text-fg"
          >
            Reset
          </Link>
        </div>
        <p className="ml-auto text-xs text-fg-muted">
          <span className="font-numeric">{total.toLocaleString()}</span> matching
          rows
        </p>
      </div>
    </form>
  );
}

function Pagination({
  filters,
  currentPage,
  totalPages,
}: {
  filters: ResolvedFilters;
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const params = new URLSearchParams();
  if (filters.entity_type) params.set("entity_type", filters.entity_type);
  if (filters.action) params.set("action", filters.action);
  if (filters.actor_email) params.set("actor_email", filters.actor_email);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  const base = params.toString();
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base);
    q.set("page", String(p));
    return `/admin/audit-log?${q.toString()}`;
  };

  const prev = currentPage > 1 ? hrefFor(currentPage - 1) : null;
  const next = currentPage < totalPages ? hrefFor(currentPage + 1) : null;

  return (
    <nav
      aria-label="Audit log pagination"
      className="flex items-center justify-between text-xs text-fg-muted"
    >
      {prev ? (
        <Link
          href={prev}
          className="rounded-md px-2 py-1 ring-1 ring-border hover:bg-surface"
        >
          ← Prev
        </Link>
      ) : (
        <span className="px-2 py-1 text-fg-subtle">← Prev</span>
      )}
      <span>
        Page <span className="font-numeric">{currentPage}</span> of{" "}
        <span className="font-numeric">{totalPages}</span>
      </span>
      {next ? (
        <Link
          href={next}
          className="rounded-md px-2 py-1 ring-1 ring-border hover:bg-surface"
        >
          Next →
        </Link>
      ) : (
        <span className="px-2 py-1 text-fg-subtle">Next →</span>
      )}
    </nav>
  );
}
