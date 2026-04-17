"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { setCatalogView } from "@/lib/actions/preferences";

type View = "table" | "grid";

/**
 * Segmented-control style toggle. Persists the choice on
 * `users.ui_catalog_view`; optimistic nothing — router.refresh() after the
 * mutation repaints with the new layout.
 */
export function ViewToggle({ current }: { current: View }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (next: View) => {
    if (next === current) return;
    startTransition(async () => {
      await setCatalogView(next);
      router.refresh();
    });
  };

  const item = (value: View, label: string, Icon: typeof List) => {
    const active = value === current;
    return (
      <button
        type="button"
        onClick={() => switchTo(value)}
        aria-pressed={active}
        disabled={pending}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium",
          "transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
          active
            ? "bg-surface text-fg ring-1 ring-inset ring-border"
            : "text-fg-muted hover:text-fg",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
    );
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md bg-surface-elevated p-0.5 ring-1 ring-inset ring-border">
      {item("table", "Table", List)}
      {item("grid", "Grid", LayoutGrid)}
    </div>
  );
}
