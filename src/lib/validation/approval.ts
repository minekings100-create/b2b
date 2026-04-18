import { z } from "zod";

/**
 * Approval decisions. SPEC §8.2 — managers can adjust `quantity_approved`
 * downward per line, reject with a required reason, or cancel from any
 * pre-shipped state.
 */

const nonNegInt = z.coerce.number().int().min(0, "Quantity must be ≥ 0");

export const ApproveOrderInput = z.object({
  order_id: z.string().uuid(),
  // FormData encodes the adjusted quantities as `approved[itemId]=N`. We
  // preprocess to a plain record of { [itemId]: number } outside Zod (see
  // action) and pass it here as already-parsed JSON.
  approved: z.record(z.string().uuid(), nonNegInt),
});
export type ApproveOrderInputT = z.infer<typeof ApproveOrderInput>;

export const RejectOrderInput = z.object({
  order_id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(4, "Reason must be ≥ 4 characters")
    .max(500, "Reason must be ≤ 500 characters"),
});
export type RejectOrderInputT = z.infer<typeof RejectOrderInput>;

export const CancelOrderInput = z.object({
  order_id: z.string().uuid(),
  reason: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().trim().max(500).nullable(),
  ),
});
export type CancelOrderInputT = z.infer<typeof CancelOrderInput>;
