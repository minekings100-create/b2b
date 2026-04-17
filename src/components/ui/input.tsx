import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Inputs: single-line, 32–36px height, subtle border,
 * accent focus ring. Label sits above (see <Label> — "label-meta").
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", invalid, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex h-9 w-full rounded-md bg-surface px-3 py-1.5 text-sm text-fg",
          "ring-1 ring-border placeholder:text-fg-subtle",
          "transition-[box-shadow,background-color] duration-150 ease-out",
          "hover:ring-border-strong",
          "focus:outline-none focus:ring-2 focus:ring-accent-ring",
          "disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-fg-disabled",
          "aria-[invalid=true]:ring-danger aria-[invalid=true]:focus:ring-danger",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
