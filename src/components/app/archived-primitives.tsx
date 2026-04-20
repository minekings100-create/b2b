import Link from "next/link";
import { Archive, ArchiveRestore } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Phase 7b-2b — archive/restore UX primitives.
 *
 * Shared components used across every entity list that supports
 * soft-delete. Per BACKLOG §"Archive / Restore UX pattern":
 *
 *  - `<ArchivedToggle>` — URL-driven pill that flips `?archived=1` on
 *    and off. Default (off) = only active rows; on = only archived
 *    rows. No "both" — reduces the cognitive load of the list view.
 *  - `<ArchivedBadge>` — small inline label next to a row's primary
 *    column when the row is soft-deleted. Readers understand the row
 *    context is archived without having to parse a separate column.
 *
 * Usage: pass the current URL state into the toggle, and render the
 * badge inside row components when the row's `deleted_at` is set.
 * Apply `opacity-60` to the row itself in the caller; that's a
 * row-level decision, not a primitive-level one, because archived
 * rows may still need full contrast on some cells (e.g. the restore
 * button).
 */

export function ArchivedToggle({
  showArchived,
  hrefOn,
  hrefOff,
}: {
  showArchived: boolean;
  /** URL to navigate to when the toggle is clicked to TURN ON archived view. */
  hrefOn: string;
  /** URL to navigate to when the toggle is clicked to TURN OFF archived view. */
  hrefOff: string;
}) {
  const href = showArchived ? hrefOff : hrefOn;
  return (
    <Link
      href={href}
      aria-pressed={showArchived}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
        showArchived
          ? "bg-accent text-accent-fg hover:bg-accent/90"
          : "bg-surface text-fg-muted hover:text-fg",
      )}
    >
      {showArchived ? (
        <ArchiveRestore className="h-3.5 w-3.5" />
      ) : (
        <Archive className="h-3.5 w-3.5" />
      )}
      {showArchived ? "Hide archived" : "Show archived"}
    </Link>
  );
}

export function ArchivedBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-sm bg-fg-subtle/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
      Archived
    </span>
  );
}
