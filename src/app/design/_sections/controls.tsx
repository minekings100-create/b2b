import {
  ArrowRight,
  Check,
  Download,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Section, StateCell, Subsection, Grid } from "./shared";

export function ControlsSection() {
  return (
    <>
      <Section
        id="buttons"
        title="Buttons"
        description="Three variants × four sizes. Hover, focus, active, disabled, loading — all visible."
      >
        <Subsection label="Variants × sizes">
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            {(
              [
                ["Primary", "primary"],
                ["Secondary", "secondary"],
                ["Ghost", "ghost"],
                ["Danger", "danger"],
              ] as const
            ).map(([label, variant]) => (
              <div key={variant} className="contents">
                <p className="text-xs text-fg-muted">{label}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant={variant} size="sm">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                  <Button variant={variant}>
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </Button>
                  <Button variant={variant} size="lg">
                    Scan pallet
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant={variant} size="icon" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Subsection>

        <Subsection label="States">
          <Grid cols={4}>
            <StateCell label="Default">
              <Button>Approve order</Button>
            </StateCell>
            <StateCell label="Hover (simulated)">
              <Button className="bg-accent-hover">Approve order</Button>
            </StateCell>
            <StateCell label="Focus-visible">
              <Button className="ring-2 ring-accent-ring">Approve order</Button>
            </StateCell>
            <StateCell label="Active (pressed)">
              <Button className="scale-[0.99] bg-accent-hover">Approve order</Button>
            </StateCell>
            <StateCell label="Disabled">
              <Button disabled>Approve order</Button>
            </StateCell>
            <StateCell label="Loading">
              <Button loading>Submitting…</Button>
            </StateCell>
            <StateCell label="Secondary · disabled">
              <Button variant="secondary" disabled>
                Export
              </Button>
            </StateCell>
            <StateCell label="Ghost · loading">
              <Button variant="ghost" loading>
                Refresh
              </Button>
            </StateCell>
          </Grid>
        </Subsection>
      </Section>

      <Section
        id="inputs"
        title="Inputs & labels"
        description="Label above (text-xs uppercase), 36px input height, accent focus ring. Error = danger ring."
      >
        <Grid cols={3}>
          <StateCell label="Default">
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" placeholder="e.g. SKU-4412-A" />
            </div>
          </StateCell>
          <StateCell label="With value">
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="sku-v">SKU</Label>
              <Input id="sku-v" defaultValue="SKU-4412-A" />
            </div>
          </StateCell>
          <StateCell label="Focus (autofocus)">
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="sku-f">SKU</Label>
              <Input
                id="sku-f"
                defaultValue="SKU-4412-A"
                className="ring-2 ring-accent-ring"
              />
            </div>
          </StateCell>
          <StateCell label="Disabled">
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="sku-d">SKU</Label>
              <Input id="sku-d" disabled defaultValue="SKU-4412-A" />
            </div>
          </StateCell>
          <StateCell label="Invalid (aria-invalid)">
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="sku-i">SKU</Label>
              <Input id="sku-i" invalid defaultValue="—" />
              <p className="text-xs text-danger">Must match SKU-XXXX-X.</p>
            </div>
          </StateCell>
          <StateCell label="Search with icon">
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="q">Search</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
                  aria-hidden
                />
                <Input id="q" placeholder="Orders, invoices, SKUs…" className="pl-8" />
              </div>
            </div>
          </StateCell>
        </Grid>
      </Section>

      <Section
        id="badges"
        title="Status badges"
        description="Dot + label + tinted bg. Reserved for status; not decoration."
      >
        <Subsection label="Order lifecycle (SPEC §7)">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Draft</Badge>
            <Badge variant="accent">Submitted</Badge>
            <Badge variant="accent">Approved</Badge>
            <Badge variant="warning">Picking</Badge>
            <Badge variant="warning">Packed</Badge>
            <Badge variant="accent">Shipped</Badge>
            <Badge variant="success">Delivered</Badge>
            <Badge variant="neutral" dot={false}>
              Closed
            </Badge>
            <Badge variant="danger">Cancelled</Badge>
          </div>
        </Subsection>

        <Subsection label="Invoice lifecycle">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Draft</Badge>
            <Badge variant="accent">Issued</Badge>
            <Badge variant="success">Paid</Badge>
            <Badge variant="danger">Overdue</Badge>
            <Badge variant="neutral" dot={false}>
              Cancelled
            </Badge>
          </div>
        </Subsection>

        <Subsection label="Meta tags (no dot)">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" dot={false}>
              VAT 21%
            </Badge>
            <Badge variant="neutral" dot={false}>
              piece
            </Badge>
            <Badge variant="warning" dot={false}>
              Backorder
            </Badge>
            <Badge variant="accent" dot={false}>
              Favourite
            </Badge>
          </div>
        </Subsection>
      </Section>

      <Section
        id="kbd"
        title="Keyboard hints"
        description="Displayed next to command palette entries and menu items (SPEC §4 keyboard-first)."
      >
        <div className="flex flex-col gap-3 rounded-lg ring-1 ring-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Open command palette</span>
            <span className="flex items-center gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Go to orders</span>
            <span className="flex items-center gap-1">
              <Kbd>g</Kbd>
              <Kbd>o</Kbd>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Next / previous row</span>
            <span className="flex items-center gap-1">
              <Kbd>j</Kbd>
              <span className="text-xs text-fg-subtle">/</span>
              <Kbd>k</Kbd>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Confirm</span>
            <span className="flex items-center gap-1">
              <Kbd>
                <Check className="h-2.5 w-2.5" />
              </Kbd>
              <Kbd>↵</Kbd>
            </span>
          </div>
        </div>
      </Section>
    </>
  );
}
