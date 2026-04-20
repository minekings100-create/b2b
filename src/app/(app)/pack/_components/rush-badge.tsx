import { Zap } from "lucide-react";

/**
 * Phase 8 — rush indicator for the pack queue + order detail.
 *
 * Subtle but unambiguous: accent-warm background, lightning icon.
 * Matches the `Badge variant` visual language without pulling in
 * a full new variant; it's the only use site for this specific
 * pairing today.
 */
export function RushBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm bg-danger-subtle/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger"
      data-testid="rush-badge"
      aria-label="Rush order"
    >
      <Zap className="h-3 w-3" aria-hidden />
      Rush
    </span>
  );
}
