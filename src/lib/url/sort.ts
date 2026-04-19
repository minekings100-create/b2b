import { z } from "zod";

/**
 * Phase 7a — URL-driven sort params for list pages.
 *
 * Pattern: `?sort=<col>&dir=asc|desc`. The set of sortable columns is
 * page-specific so each list passes its own enum to `parseSortParam`.
 *
 * Click sequence per BACKLOG entry "Sortable column headers on order
 * tables": asc → desc → reset (no sort param). The component layer
 * (`<SortableHeader>`) implements the cycle by computing the next href.
 */

export type SortDirection = "asc" | "desc";

export type ParsedSort<TCol extends string> = {
  column: TCol;
  direction: SortDirection;
};

const Direction = z.enum(["asc", "desc"]).default("asc");

export function parseSortParam<TCol extends string>(
  raw: { sort?: string | null; dir?: string | null },
  allowed: readonly TCol[],
  fallback: ParsedSort<TCol> | null = null,
): ParsedSort<TCol> | null {
  const Column = z.enum(allowed as readonly [TCol, ...TCol[]]);
  const sort = Column.safeParse(raw.sort ?? "");
  if (!sort.success) return fallback;
  const dir = Direction.parse(raw.dir ?? "asc");
  return { column: sort.data, direction: dir };
}

/**
 * Returns the next link state for clicking a header — implements the
 * asc → desc → reset cycle. `current` is the active sort (or null if
 * unsorted); `column` is the header being clicked.
 */
export function nextSortHref<TCol extends string>(
  base: string,
  current: ParsedSort<TCol> | null,
  column: TCol,
  preserveParams: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preserveParams)) {
    if (v != null && v !== "") params.set(k, v);
  }

  // Determine the next state.
  if (!current || current.column !== column) {
    params.set("sort", column);
    params.set("dir", "asc");
  } else if (current.direction === "asc") {
    params.set("sort", column);
    params.set("dir", "desc");
  } else {
    // Reset — drop the sort params entirely.
    params.delete("sort");
    params.delete("dir");
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Indicator state for `<SortableHeader>` rendering.
 */
export function sortIndicator<TCol extends string>(
  current: ParsedSort<TCol> | null,
  column: TCol,
): "asc" | "desc" | "none" {
  if (!current || current.column !== column) return "none";
  return current.direction;
}
