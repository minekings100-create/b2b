import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SPEC §4 — Loading states = skeleton rows, not spinners.
 * `Skeleton` is the primitive. `SkeletonRow` composes one inside a <tr>.
 */

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("skeleton h-4 w-full rounded-md", className)}
      {...props}
    />
  );
}

export interface SkeletonRowProps {
  columns: number;
  widths?: readonly string[];
}

export function SkeletonRow({ columns, widths }: SkeletonRowProps) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="h-10 px-3 align-middle">
          <Skeleton className={widths?.[i] ?? "w-full"} />
        </td>
      ))}
    </tr>
  );
}
