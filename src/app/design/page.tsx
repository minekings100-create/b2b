import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { FoundationsSection } from "./_sections/foundations";
import { ControlsSection } from "./_sections/controls";
import { DataDisplaySection } from "./_sections/data-display";

const TOC = [
  { id: "foundations",  label: "Foundations" },
  { id: "buttons",      label: "Buttons" },
  { id: "inputs",       label: "Inputs" },
  { id: "badges",       label: "Badges" },
  { id: "kbd",          label: "Keyboard" },
  { id: "table",        label: "Tables" },
  { id: "sidebar",      label: "Sidebar" },
  { id: "page-header",  label: "Page header" },
  { id: "empty-state",  label: "Empty states" },
];

export const metadata = {
  title: "Design system · §4",
};

export default function DesignSystemPage() {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring rounded-sm"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Home
        </Link>
        <p className="label-meta mb-2">§4 contents</p>
        <nav aria-label="Design system sections" className="flex flex-col gap-0.5">
          {TOC.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <main className="flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-gutter backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="label-meta">Design system</span>
            <span className="text-sm font-medium text-fg">SPEC §4</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-fg-subtle sm:inline">
              Toggle to verify both themes
            </span>
            <ThemeToggle />
          </div>
        </header>

        <FoundationsSection />
        <ControlsSection />
        <DataDisplaySection />

        <footer className="px-gutter py-10 text-xs text-fg-subtle">
          Internal procurement platform · design tokens & base components · SPEC §4
        </footer>
      </main>
    </div>
  );
}
