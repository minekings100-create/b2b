/**
 * SPEC §3 — monetary values are integers in cents. UI formats in EUR with
 * Dutch locale grouping/decimals so totals read naturally for the operator.
 */

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return euro.format(cents / 100);
}
