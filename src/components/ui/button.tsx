import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Buttons: primary | secondary | ghost.
 * Heights: 32 default, 28 sm (table row actions), 48 lg (packer view).
 * Transitions: 150ms ease-out, transform/opacity only.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md font-medium select-none tracking-[-0.005em]",
    "transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-accent text-accent-fg",
          "shadow-[inset_0_-1px_0_0_rgb(0_0_0/0.14),inset_0_1px_0_0_rgb(255_255_255/0.08)]",
          "hover:bg-accent-hover",
          "active:bg-accent-hover active:scale-[0.99] active:shadow-[inset_0_1px_0_0_rgb(0_0_0/0.14)]",
        ],
        secondary: [
          "bg-surface text-fg ring-1 ring-inset ring-border",
          "hover:bg-surface-elevated hover:ring-border-strong",
          "active:bg-surface-elevated active:scale-[0.99]",
        ],
        ghost: [
          "bg-transparent text-fg-muted",
          "hover:bg-surface-elevated hover:text-fg",
          "active:bg-surface-elevated active:scale-[0.99]",
        ],
        danger: [
          "bg-danger text-white",
          "shadow-[inset_0_-1px_0_0_rgb(0_0_0/0.18),inset_0_1px_0_0_rgb(255_255_255/0.08)]",
          "hover:bg-danger/90",
          "active:bg-danger/90 active:scale-[0.99] active:shadow-[inset_0_1px_0_0_rgb(0_0_0/0.18)]",
        ],
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        default: "h-8 px-3 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
