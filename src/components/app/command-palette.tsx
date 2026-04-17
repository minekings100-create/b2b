"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, ShoppingCart, FileText, Package, Archive } from "lucide-react";

/**
 * Command palette skeleton. SPEC §4 calls for ⌘K on every screen with
 * scoped search + navigation + actions. Phase 1.3 ships the navigation
 * shell only; search & actions land alongside their owning phases.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => () => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
    >
      <div
        aria-hidden
        className="fixed inset-0 bg-black/30"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg bg-surface ring-1 ring-border shadow-popover">
        <Command.Input
          placeholder="Search or jump to…"
          className="h-11 w-full bg-transparent px-4 text-sm outline-none placeholder:text-fg-subtle"
        />
        <Command.List className="max-h-80 overflow-y-auto border-t border-border p-2">
          <Command.Empty className="px-3 py-6 text-center text-xs text-fg-subtle">
            No results.
          </Command.Empty>
          <Command.Group heading="Go to">
            <Command.Item
              onSelect={go("/dashboard")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated"
            >
              <Home className="h-3.5 w-3.5" /> Dashboard
            </Command.Item>
            <Command.Item
              onSelect={go("/orders")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Orders
            </Command.Item>
            <Command.Item
              onSelect={go("/invoices")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated"
            >
              <FileText className="h-3.5 w-3.5" /> Invoices
            </Command.Item>
            <Command.Item
              onSelect={go("/pack")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated"
            >
              <Package className="h-3.5 w-3.5" /> Pack queue
            </Command.Item>
            <Command.Item
              onSelect={go("/returns")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-surface-elevated"
            >
              <Archive className="h-3.5 w-3.5" /> Returns
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
