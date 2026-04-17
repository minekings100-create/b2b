import { z } from "zod";

/**
 * Zod schema for a single CSV-import row. Accepts loose strings from the
 * parser and coerces into the shape products.ts expects. `category_name`
 * is resolved to a `category_id` at the action layer (needs DB lookup).
 *
 * Expected columns (case-sensitive header):
 *   sku                — required, unique
 *   name               — required
 *   description        — optional
 *   category_name      — optional; must match an existing category
 *   unit               — optional, defaults to "piece"
 *   unit_price_euro    — required, "12.50" or "12,50"
 *   vat_rate           — required, 0 | 9 | 21
 *   min_order_qty      — optional, default 1
 *   max_order_qty      — optional
 */

const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    schema.nullable(),
  );

const priceEuroToCents = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "number") return Math.round(v * 100);
  if (typeof v === "string") {
    const normalized = v.replace(/,/g, ".").trim();
    const asFloat = Number.parseFloat(normalized);
    if (!Number.isFinite(asFloat)) return v; // let Zod surface the error
    return Math.round(asFloat * 100);
  }
  return v;
}, z.number().int().min(0, "Price must be ≥ 0"));

export const CSV_COLUMNS = [
  "sku",
  "name",
  "description",
  "category_name",
  "unit",
  "unit_price_euro",
  "vat_rate",
  "min_order_qty",
  "max_order_qty",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/**
 * Schema that parses a raw CSV row (strings in every field) into a typed,
 * validated row. `category_id` is not set here — the action resolves it.
 */
export const CsvProductRow = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(50)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,49}$/,
      "SKU may contain letters, digits, dash, dot, underscore",
    ),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: emptyToNull(z.string().trim().max(2000)),
  category_name: emptyToNull(z.string().trim().max(80)),
  unit: z.preprocess(
    (v) => (v === "" || v === undefined ? "piece" : v),
    z.string().trim().min(1).max(20),
  ),
  unit_price_cents: priceEuroToCents,
  vat_rate: z.coerce
    .number()
    .refine((n) => n === 0 || n === 9 || n === 21, "VAT must be 0, 9 or 21"),
  min_order_qty: z.preprocess(
    (v) => (v === "" || v === undefined ? 1 : v),
    z.coerce.number().int().min(1, "Min order ≥ 1"),
  ),
  max_order_qty: emptyToNull(z.coerce.number().int().min(1)),
});
export type CsvProductRowT = z.infer<typeof CsvProductRow>;

/** Accepts the CSV `unit_price_euro` column name, then re-keys to
 *  `unit_price_cents` for the Zod schema. */
export function normaliseRawRow(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if ("unit_price_euro" in out && !("unit_price_cents" in out)) {
    out.unit_price_cents = out.unit_price_euro;
    delete out.unit_price_euro;
  }
  return out;
}
