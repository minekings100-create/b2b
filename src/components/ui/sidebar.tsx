"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Kbd } from "./kbd";

/**
 * SPEC §4 — Left sidebar, 240px; collapses to 56px (icons only).
 * Section labels: text-xs uppercase tracking-wide text-fg-muted.
 * Active item: accent 2px left border + accent text.
 */

interface SidebarContextValue {
  collapsed: boolean;
}
const SidebarContext = React.createContext<SidebarContextValue>({ collapsed: false });

export function Sidebar({
  collapsed = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { collapsed?: boolean }) {
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <aside
        data-collapsed={collapsed || undefined}
        className={cn(
          "flex h-full flex-col border-r border-border bg-surface",
          "transition-[width] duration-slow ease-out",
          collapsed ? "w-14" : "w-60",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-14 items-center gap-2 border-b border-border px-3", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-1 flex-col gap-4 overflow-y-auto py-3", className)}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-border px-3 py-2", className)}
      {...props}
    />
  );
}

export function SidebarSection({
  label,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { label?: string }) {
  const { collapsed } = React.useContext(SidebarContext);
  return (
    <div className={cn("flex flex-col gap-0.5 px-2", className)} {...props}>
      {label && !collapsed ? (
        <div className="label-meta px-2 pb-1 pt-1">{label}</div>
      ) : null}
      {children}
    </div>
  );
}

const itemVariants = cva(
  [
    "group/item relative flex items-center rounded-md text-sm font-medium",
    "transition-[background-color,color] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
  ],
  {
    variants: {
      active: {
        true: "bg-accent-subtle/60 text-accent-subtle-fg",
        false: "text-fg-muted hover:bg-surface-elevated hover:text-fg",
      },
    },
    defaultVariants: { active: false },
  },
);

export interface SidebarItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof itemVariants> {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  count?: number;
  as?: "button" | "a";
  href?: string;
}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, active, icon, label, shortcut, count, as = "button", href, ...props }, ref) => {
    const { collapsed } = React.useContext(SidebarContext);
    const inner = (
      <>
        {active ? (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-md bg-accent"
          />
        ) : null}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-fg-subtle group-hover/item:text-fg">
          {icon}
        </span>
        {!collapsed && (
          <>
            <span className="ml-2 flex-1 truncate text-left">{label}</span>
            {typeof count === "number" ? (
              <span className="ml-2 rounded-full bg-surface-elevated px-1.5 text-[10px] font-medium text-fg-muted">
                {count}
              </span>
            ) : null}
            {shortcut ? (
              <Kbd className="ml-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                {shortcut}
              </Kbd>
            ) : null}
          </>
        )}
      </>
    );

    const classes = cn(
      itemVariants({ active }),
      collapsed ? "h-9 w-9 justify-center px-0" : "h-9 px-2.5",
      className,
    );

    if (as === "a") {
      return (
        <a
          href={href}
          className={classes}
          aria-current={active ? "page" : undefined}
        >
          {inner}
        </a>
      );
    }
    return (
      <button ref={ref} type="button" className={classes} {...props}>
        {inner}
      </button>
    );
  },
);
SidebarItem.displayName = "SidebarItem";
