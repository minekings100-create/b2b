import { Section, Subsection } from "./shared";

const NEUTRAL_SWATCHES = [
  { name: "bg", className: "bg-bg" },
  { name: "surface", className: "bg-surface" },
  { name: "surface-elevated", className: "bg-surface-elevated" },
  { name: "border", className: "bg-border" },
  { name: "border-strong", className: "bg-border-strong" },
  { name: "fg-disabled", className: "bg-fg-disabled" },
  { name: "fg-subtle", className: "bg-fg-subtle" },
  { name: "fg-muted", className: "bg-fg-muted" },
  { name: "fg", className: "bg-fg" },
];

const ACCENT_SWATCHES = [
  { name: "accent-subtle", className: "bg-accent-subtle" },
  { name: "accent", className: "bg-accent" },
  { name: "accent-hover", className: "bg-accent-hover" },
  { name: "accent-ring", className: "bg-accent-ring" },
];

const STATUS_SWATCHES = [
  { name: "success-subtle", className: "bg-success-subtle" },
  { name: "success", className: "bg-success" },
  { name: "warning-subtle", className: "bg-warning-subtle" },
  { name: "warning", className: "bg-warning" },
  { name: "danger-subtle", className: "bg-danger-subtle" },
  { name: "danger", className: "bg-danger" },
];

const TYPE_SCALE = [
  { size: "text-2xl", value: "24 / 1.2", sample: "Order ORD-2026-0001" },
  { size: "text-xl", value: "20 / 1.2", sample: "Branch Haarlem" },
  { size: "text-lg", value: "16 / 1.35", sample: "Open invoices" },
  { size: "text-base", value: "14 / 1.5", sample: "Default body copy, prose lines and table captions." },
  { size: "text-sm", value: "13 / 1.35", sample: "Dense body text used inside tables, list items, and forms." },
  { size: "text-xs", value: "11 / 1.35", sample: "META · UPPERCASE · KBD HINT" },
];

const RADII = [
  { name: "rounded-md", note: "6px — buttons, inputs, badges", className: "rounded-md" },
  { name: "rounded-lg", note: "8px — cards, panels", className: "rounded-lg" },
  { name: "rounded-full", note: "avatars, status dots only", className: "rounded-full" },
];

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`${className} h-14 rounded-md ring-1 ring-inset ring-border`}
      />
      <div className="flex flex-col gap-0.5">
        <code className="font-mono text-xs text-fg">{name}</code>
      </div>
    </div>
  );
}

export function FoundationsSection() {
  return (
    <Section
      id="foundations"
      title="Foundations"
      description="Design tokens driving every component. Swap accent by changing one CSS variable."
    >
      <Subsection label="Neutrals">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {NEUTRAL_SWATCHES.map((s) => (
            <Swatch key={s.name} {...s} />
          ))}
        </div>
      </Subsection>

      <Subsection label="Accent">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACCENT_SWATCHES.map((s) => (
            <Swatch key={s.name} {...s} />
          ))}
        </div>
      </Subsection>

      <Subsection label="Status">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_SWATCHES.map((s) => (
            <Swatch key={s.name} {...s} />
          ))}
        </div>
      </Subsection>

      <Subsection label="Type scale">
        <div className="divide-y divide-border rounded-lg ring-1 ring-border">
          {TYPE_SCALE.map((t) => (
            <div
              key={t.size}
              className="grid grid-cols-[140px_80px_1fr] items-baseline gap-4 px-4 py-3"
            >
              <code className="font-mono text-xs text-fg-muted">{t.size}</code>
              <code className="font-mono text-xs text-fg-subtle">{t.value}</code>
              <p className={t.size}>{t.sample}</p>
            </div>
          ))}
        </div>
      </Subsection>

      <Subsection label="Radii">
        <div className="grid grid-cols-3 gap-3">
          {RADII.map((r) => (
            <div key={r.name} className="flex flex-col gap-2">
              <div
                className={`${r.className} h-14 bg-accent-subtle ring-1 ring-inset ring-border`}
              />
              <code className="font-mono text-xs text-fg">{r.name}</code>
              <p className="text-xs text-fg-subtle">{r.note}</p>
            </div>
          ))}
        </div>
      </Subsection>

      <Subsection label="Numeric typography">
        <div className="rounded-lg ring-1 ring-border p-4 flex flex-col gap-2">
          <p className="text-sm text-fg-muted">
            Tabular figures, monospace for invoice/order/pallet numbers (SPEC §4).
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <code className="font-numeric text-sm">INV-2026-00042</code>
            <code className="font-numeric text-sm">ORD-2026-0001</code>
            <code className="font-numeric text-sm">PAL-2026-00017</code>
            <code className="font-numeric text-sm">SKU-4412-A</code>
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6 text-right">
            {["12,450.00", "312.00", "8.80", "1,204.50", "9,998.12", "0.00"].map((n) => (
              <span key={n} className="font-numeric text-sm">€ {n}</span>
            ))}
          </div>
        </div>
      </Subsection>
    </Section>
  );
}
