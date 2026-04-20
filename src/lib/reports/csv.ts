/**
 * Phase 7b-2c — tiny CSV builder.
 *
 * Not worth a dep: the only quoting rule that matters for our exports
 * is "wrap any cell containing comma, quote, CR, or LF in double
 * quotes, and double-up interior quotes." RFC 4180 minus BOM.
 *
 * Emits CRLF line endings for Excel-friendliness. Header row is the
 * first argument.
 */

export function buildCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) {
    lines.push(row.map((c) => escapeCell(c)).join(","));
  }
  return lines.join("\r\n");
}

function escapeCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const s = typeof cell === "number" ? String(cell) : cell;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Builds `Content-Disposition: attachment; filename="..."` for a download. */
export function contentDisposition(filename: string): string {
  return `attachment; filename="${filename.replace(/"/g, "")}"`;
}

/** Formats an integer cent amount as a plain "123.45" string (no currency
 *  symbol) for CSV cells. */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}
