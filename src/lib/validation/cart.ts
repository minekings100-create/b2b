import { z } from "zod";

/**
 * Cart mutations — each accepts FormData from a Server Action. Quantities
 * are coerced to integers; price/line math is recomputed server-side against
 * the live product row (never trust client-supplied price).
 */

export const AddToCartInput = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1, "Quantity must be ≥ 1"),
});
export type AddToCartInputT = z.infer<typeof AddToCartInput>;

export const UpdateCartItemInput = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1, "Quantity must be ≥ 1"),
});
export type UpdateCartItemInputT = z.infer<typeof UpdateCartItemInput>;

export const RemoveCartItemInput = z.object({
  item_id: z.string().uuid(),
});
export type RemoveCartItemInputT = z.infer<typeof RemoveCartItemInput>;

export const SubmitOrderInput = z.object({
  order_id: z.string().uuid(),
  confirm_override: z
    .preprocess(
      (v) => (v === "CONFIRM" ? true : v === "" || v === undefined ? false : v),
      z.boolean(),
    )
    .default(false),
  // Phase 8 — creator flags the order as rush at submit time. Native
  // HTML checkboxes POST "on" when checked and omit the field when
  // unchecked, so treat "on"/"true"/true as true and everything else
  // as false.
  is_rush: z
    .preprocess(
      (v) => (v === "on" || v === "true" || v === true ? true : false),
      z.boolean(),
    )
    .default(false),
});
export type SubmitOrderInputT = z.infer<typeof SubmitOrderInput>;
