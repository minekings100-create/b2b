import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Empty states are friendly but spare. No illustrations, no emoji.
 * A lucide icon + title + optional description + optional action.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center",
        className,
      )}
      role="status"
      {...props}
    >
      {icon ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated text-fg-muted">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
