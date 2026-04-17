import { Badge } from "@/components/ui/badge";

export function StockPill({
  available,
  reorderLevel,
}: {
  available: number;
  reorderLevel: number;
}) {
  if (available <= 0) {
    return <Badge variant="danger">Out of stock</Badge>;
  }
  if (available <= reorderLevel) {
    return <Badge variant="warning">Low stock</Badge>;
  }
  return <Badge variant="success">In stock</Badge>;
}
