import {
  Archive,
  BarChart3,
  Box,
  Download,
  FileText,
  Home,
  Inbox,
  MoreHorizontal,
  Package,
  Pencil,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarSection,
} from "@/components/ui/sidebar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonRow } from "@/components/ui/skeleton-row";
import { Section, Subsection } from "./shared";

const SAMPLE_ORDERS = [
  { id: "ORD-2026-0041", branch: "Haarlem",   items: 12, total: "1,204.50", status: "approved" as const },
  { id: "ORD-2026-0040", branch: "Utrecht",   items:  4, total:   "312.00", status: "picking"  as const },
  { id: "ORD-2026-0039", branch: "Den Haag",  items:  8, total:   "980.80", status: "shipped"  as const },
  { id: "ORD-2026-0038", branch: "Amsterdam", items:  3, total:   "180.00", status: "delivered" as const },
  { id: "ORD-2026-0037", branch: "Rotterdam", items: 16, total: "2,540.25", status: "draft"    as const },
];

const STATUS_BADGE = {
  draft:     { variant: "neutral",  label: "Draft" },
  submitted: { variant: "accent",   label: "Submitted" },
  approved:  { variant: "accent",   label: "Approved" },
  picking:   { variant: "warning",  label: "Picking" },
  shipped:   { variant: "accent",   label: "Shipped" },
  delivered: { variant: "success",  label: "Delivered" },
  cancelled: { variant: "danger",   label: "Cancelled" },
} as const;

export function DataDisplaySection() {
  return (
    <>
      <Section
        id="table"
        title="Tables"
        description="Zebra off, sticky header, 40px rows, monospace numerics, row actions reveal on hover."
      >
        <Subsection label="Populated">
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead sort="desc" sortHref="#">Order</TableHead>
                  <TableHead sort="none" sortHref="#">Branch</TableHead>
                  <TableHead sort="none" sortHref="#" className="text-right">Items</TableHead>
                  <TableHead sort="none" sortHref="#" className="text-right">Total (€)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0 text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_ORDERS.map((o, i) => {
                  const s = STATUS_BADGE[o.status];
                  return (
                    <TableRow key={o.id} selected={i === 1}>
                      <TableCell className="font-numeric">{o.id}</TableCell>
                      <TableCell>{o.branch}</TableCell>
                      <TableCell numeric>{o.items}</TableCell>
                      <TableCell numeric>{o.total}</TableCell>
                      <TableCell>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="w-0 whitespace-nowrap">
                        <TableRowActions>
                          <Button size="icon" variant="ghost" aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="More">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Subsection>

        <Subsection label="Loading (skeleton rows)">
          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total (€)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonRow columns={5} widths={["w-28", "w-24", "w-8 ml-auto", "w-16 ml-auto", "w-20"]} />
                <SkeletonRow columns={5} widths={["w-28", "w-32", "w-6 ml-auto", "w-20 ml-auto", "w-16"]} />
                <SkeletonRow columns={5} widths={["w-28", "w-20", "w-10 ml-auto", "w-14 ml-auto", "w-24"]} />
                <SkeletonRow columns={5} widths={["w-28", "w-28", "w-8 ml-auto", "w-16 ml-auto", "w-20"]} />
              </TableBody>
            </Table>
          </div>
        </Subsection>

        <Subsection label="Primitive skeletons">
          <div className="flex flex-col gap-3 rounded-lg ring-1 ring-border p-4 max-w-md">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Subsection>
      </Section>

      <Section
        id="sidebar"
        title="Sidebar"
        description="Left sidebar 240px, collapsible to 56px. Active item has 2px accent left-border + accent text."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-[440px] overflow-hidden rounded-lg ring-1 ring-border">
            <Sidebar>
              <SidebarHeader>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg text-xs font-semibold">
                  PP
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium text-fg">Procurement</span>
                  <span className="text-xs text-fg-subtle">HQ · Europe</span>
                </div>
              </SidebarHeader>
              <SidebarContent>
                <SidebarSection label="Workspace">
                  <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" active />
                  <SidebarItem icon={<ShoppingCart className="h-4 w-4" />} label="Orders" count={24} shortcut="go" />
                  <SidebarItem icon={<FileText className="h-4 w-4" />} label="Invoices" count={3} shortcut="gi" />
                  <SidebarItem icon={<Inbox className="h-4 w-4" />} label="Approvals" count={2} />
                </SidebarSection>
                <SidebarSection label="Warehouse">
                  <SidebarItem icon={<Package className="h-4 w-4" />} label="Pack queue" shortcut="gp" />
                  <SidebarItem icon={<Truck className="h-4 w-4" />} label="Shipments" />
                  <SidebarItem icon={<Archive className="h-4 w-4" />} label="Returns" />
                </SidebarSection>
                <SidebarSection label="Admin">
                  <SidebarItem icon={<Box className="h-4 w-4" />} label="Catalog" />
                  <SidebarItem icon={<Users className="h-4 w-4" />} label="Users" />
                  <SidebarItem icon={<BarChart3 className="h-4 w-4" />} label="Reports" />
                </SidebarSection>
              </SidebarContent>
              <SidebarFooter>
                <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" />
              </SidebarFooter>
            </Sidebar>
          </div>

          <div className="h-[440px] overflow-hidden rounded-lg ring-1 ring-border">
            <Sidebar collapsed>
              <SidebarHeader>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg text-xs font-semibold">
                  PP
                </div>
              </SidebarHeader>
              <SidebarContent>
                <SidebarSection>
                  <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" active />
                  <SidebarItem icon={<ShoppingCart className="h-4 w-4" />} label="Orders" />
                  <SidebarItem icon={<FileText className="h-4 w-4" />} label="Invoices" />
                  <SidebarItem icon={<Inbox className="h-4 w-4" />} label="Approvals" />
                </SidebarSection>
                <SidebarSection>
                  <SidebarItem icon={<Package className="h-4 w-4" />} label="Pack queue" />
                  <SidebarItem icon={<Truck className="h-4 w-4" />} label="Shipments" />
                  <SidebarItem icon={<Archive className="h-4 w-4" />} label="Returns" />
                </SidebarSection>
              </SidebarContent>
              <SidebarFooter>
                <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" />
              </SidebarFooter>
            </Sidebar>
          </div>
        </div>
      </Section>

      <Section
        id="page-header"
        title="Page header"
        description="Breadcrumb + title + optional description + actions. No shadows. Sits above the content region."
      >
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <PageHeader
            title="Orders"
            description="All orders across every branch, oldest submitted first."
            breadcrumbs={[
              { label: "Admin", href: "/" },
              { label: "Orders" },
            ]}
            actions={
              <>
                <Button variant="secondary">
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button>New order</Button>
              </>
            }
          />
          <div className="px-gutter py-6 text-sm text-fg-muted">Page body…</div>
        </div>
      </Section>

      <Section
        id="empty-state"
        title="Empty states"
        description="Friendly, spare, no illustrations or emoji. Icon + title + description + action."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No orders match your filters"
            description="Try clearing the status filter or widening the date range."
            action={<Button variant="secondary">Clear filters</Button>}
          />
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No pallets open"
            description="Scan a product barcode to open the first pallet for this order."
          />
        </div>
      </Section>
    </>
  );
}
