import { z } from "zod";

/**
 * Post-MVP Sprint 1 — branch create / update schemas.
 *
 * Branch archive/restore already shipped in 7b-2b — out of scope for
 * this module.
 */

const centsInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().int().min(0).nullable(),
);

const paymentTermDaysInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 14 : v),
  z.coerce.number().int().min(0).max(365),
);

const optionalTrimmed = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .default(null);

export const BranchCreateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  branch_code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Code must be 2+ chars")
    .max(12, "Code must be 12 chars or fewer")
    .regex(/^[A-Z0-9_-]+$/, "Letters/digits/_/- only"),
  email: optionalTrimmed(200),
  phone: optionalTrimmed(40),
  visiting_address: optionalTrimmed(500),
  billing_address: optionalTrimmed(500),
  shipping_address: optionalTrimmed(500),
  kvk_number: optionalTrimmed(40),
  vat_number: optionalTrimmed(40),
  iban: optionalTrimmed(40),
  monthly_budget_cents: centsInt,
  payment_term_days: paymentTermDaysInt,
});
export type BranchCreateInputT = z.infer<typeof BranchCreateInput>;

export const BranchUpdateInput = BranchCreateInput.extend({
  id: z.string().uuid(),
});
export type BranchUpdateInputT = z.infer<typeof BranchUpdateInput>;

export const BranchIdInput = z.object({ id: z.string().uuid() });
