import * as React from "react";
import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-20 border-b border-border px-gutter py-section", className)}
    >
      <header className="mb-8 flex flex-col gap-1">
        <p className="label-meta">§4 · {id.replace(/-/g, " ")}</p>
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm text-fg-muted">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function Subsection({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 last:mb-0 flex flex-col gap-3", className)}>
      <p className="label-meta">{label}</p>
      {children}
    </div>
  );
}

/** Labeled cell for showcasing a specific state of a component. */
export function StateCell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[72px] flex-col justify-between gap-3 rounded-md bg-surface p-4 ring-1 ring-border",
        className,
      )}
    >
      <div className="flex items-center gap-3">{children}</div>
      <p className="text-xs text-fg-subtle">{label}</p>
    </div>
  );
}

export function Grid({
  cols = 3,
  children,
  className,
}: {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}) {
  const colsClass =
    cols === 4
      ? "grid-cols-2 md:grid-cols-4"
      : cols === 3
        ? "grid-cols-2 md:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2";
  return (
    <div className={cn("grid gap-3", colsClass, className)}>{children}</div>
  );
}
