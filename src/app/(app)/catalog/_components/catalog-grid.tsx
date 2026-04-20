import type { CatalogProduct } from "@/lib/db/catalog";
import { CatalogTile } from "./catalog-tile";

/**
 * Grid view — image-forward tiles. 2 cols on mobile, 3 on tablet, 4-6 on
 * wider desktop. Each tile opens the detail drawer via `?pid=`.
 *
 * Tiles are rendered as a client component (`CatalogTile`) so tiles with
 * variant-group siblings can own the "currently shown variant" state
 * and swap price / stock / SKU / image in place. The tile reads the
 * current search params client-side to build its `?pid=` link, so this
 * server wrapper only forwards data.
 */
export function CatalogGrid({
  rows,
  selectedId,
}: {
  rows: CatalogProduct[];
  selectedId: string | undefined;
}) {
  return (
    <div className="px-gutter py-4">
      <ul
        role="list"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {rows.map((p) => (
          <li key={p.id}>
            <CatalogTile product={p} selectedRowId={selectedId} />
          </li>
        ))}
      </ul>
    </div>
  );
}
