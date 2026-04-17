import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Status badges: small pill, • dot + label,
 * tinted bg + colored text. Dot can be suppressed for meta tags.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-md px-2 py-[3px]",
    "text-[11px] font-medium leading-[14px] tracking-[-0.005em]",
    "ring-1 ring-inset",
  ],
  {
    variants: {
      variant: {
        neutral: "bg-surface-elevated text-fg-muted ring-border",
        accent:  "bg-accent-subtle text-accent-subtle-fg ring-accent/25",
        success: "bg-success-subtle text-success-subtle-fg ring-success/25",
        warning: "bg-warning-subtle text-warning-subtle-fg ring-warning/25",
        danger:  "bg-danger-subtle text-danger-subtle-fg ring-danger/25",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

const dotFillVariants = cva("relative inline-flex h-1.5 w-1.5 rounded-full", {
  variants: {
    variant: {
      neutral: "bg-fg-muted",
      accent:  "bg-accent",
      success: "bg-success",
      warning: "bg-warning",
      danger:  "bg-danger",
    },
  },
  defaultVariants: { variant: "neutral" },
});

const dotHaloVariants = cva(
  "absolute inset-[-2px] rounded-full opacity-30",
  {
    variants: {
      variant: {
        neutral: "bg-fg-muted",
        accent:  "bg-accent",
        success: "bg-success",
        warning: "bg-warning",
        danger:  "bg-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({
  className,
  variant,
  dot = true,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span
          className="relative inline-flex h-1.5 w-1.5 items-center justify-center"
          aria-hidden
        >
          <span className={dotHaloVariants({ variant })} />
          <span className={dotFillVariants({ variant })} />
        </span>
      ) : null}
      {children}
    </span>
  );
}
