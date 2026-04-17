"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Right drawer (not modal) for detail views where possible.
 * Slide in from the right; backdrop dims the page; Esc and backdrop click
 * close. No modal-inside-modal — the drawer is a single layer.
 *
 * Minimal foundation: visibility is driven by `open`, callers decide where
 * the state lives (URL param, useState, etc.). Uses a portal-free layout —
 * the backdrop + panel sit at the root of the tree via fixed positioning.
 */

export interface DrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: React.ReactNode;
  /** Aria label / title for the drawer. Rendered in the header. */
  title?: React.ReactNode;
  /** Optional right-aligned action slot in the header. */
  actions?: React.ReactNode;
  /** Width class; defaults to ~480px. */
  widthClassName?: string;
}

export function Drawer({
  open,
  onOpenChange,
  children,
  title,
  actions,
  widthClassName,
}: DrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Avoid interactive focus leaking to the page behind while open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/30 transition-opacity duration-150"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full flex-col bg-surface shadow-popover",
          "ring-1 ring-border",
          "transition-transform duration-150 ease-out",
          widthClassName ?? "w-full max-w-md",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            {title ? (
              <h2 className="truncate text-base font-semibold tracking-tight text-fg">
                {title}
              </h2>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
