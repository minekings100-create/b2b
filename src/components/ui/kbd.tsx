import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Keyboard hints rendered in mono, shown next to menu items and
 * in the command palette. Minimal, high-contrast, no shadows.
 */
export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1.5",
        "bg-surface-elevated ring-1 ring-inset ring-border",
        "font-mono text-[10px] font-medium text-fg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
