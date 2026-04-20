import { z } from "zod";

/**
 * SPEC §6 — products. Monetary in cents, VAT ∈ {0, 9, 21}, SKU must be
 * human-typeable and unique.
 */

const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    schema.nullable(),
  );

/** Accepts either cents (integer) or a euro string like "12.50" / "12,50". */
const priceCents = z.preprocess((v) => {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const normalized = v.replace(/,/g, ".").trim();
    const asFloat = Number.parseFloat(normalized);
    if (!Number.isFinite(asFloat)) return v; // let Zod surface the error
    return Math.round(asFloat * 100);
  }
  return v;
}, z.number().int().min(0, "Price must be ≥ 0"));

export const VAT_RATES = [0, 9, 21] as const;

// Base object kept unrefined so it remains `.extend()`-able for the
// update schema. The variant-label / variant-group cross-field rule is
// applied with `.superRefine()` at the two exported schemas.
const ProductBase = z.object({
  sku: z
    .string()
    .min(1, "SKU is required")
    .max(50, "SKU must be ≤ 50 chars")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,49}$/,
      "SKU may contain letters, digits, dash, dot, underscore",
    ),
  name: z.string().min(1, "Name is required").max(200),
  description: emptyToNull(z.string().max(2000)),
  category_id: emptyToNull(z.string().uuid("Invalid category")),
  unit: z.string().min(1, "Unit is required").max(20),
  unit_price_cents: priceCents,
  vat_rate: z.coerce
    .number()
    .refine(
      (n) => (VAT_RATES as readonly number[]).includes(n),
      "VAT must be 0, 9 or 21",
    ),
  min_order_qty: z.coerce.number().int().min(1, "Min order ≥ 1"),
  max_order_qty: emptyToNull(z.coerce.number().int().min(1)),
  variant_group_id: emptyToNull(z.string().uuid("Invalid variant group")),
  variant_label: emptyToNull(z.string().max(30, "Variant label ≤ 30 chars")),
});

const variantPairRule = (
  v: { variant_group_id: string | null; variant_label: string | null },
  ctx: z.RefinementCtx,
) => {
  if (v.variant_label != null && v.variant_group_id == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["variant_label"],
      message: "Variant label needs a variant group",
    });
  }
};

export const ProductCreateInput = ProductBase.superRefine(variantPairRule);
export type ProductCreateInputT = z.infer<typeof ProductCreateInput>;

export const ProductUpdateInput = ProductBase.extend({
  id: z.string().uuid(),
}).superRefine(variantPairRule);
export type ProductUpdateInputT = z.infer<typeof ProductUpdateInput>;

export const ProductArchiveInput = z.object({
  id: z.string().uuid(),
});
