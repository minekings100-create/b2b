import { z } from "zod";

/**
 * Quantity adjustment — user enters an amount + direction; the server maps
 * that to a signed delta and the appropriate `inventory_movement_reason`.
 */
export const InventoryAdjustInput = z.object({
  product_id: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  amount: z.coerce.number().int().positive("Amount must be ≥ 1"),
  note: z
    .preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.string().max(500).nullable(),
    )
    .nullable(),
});
export type InventoryAdjustInputT = z.infer<typeof InventoryAdjustInput>;

/**
 * Meta update — reorder level and warehouse bin location only. No movement
 * row; the on-hand count is untouched.
 */
export const InventoryMetaInput = z.object({
  product_id: z.string().uuid(),
  reorder_level: z.coerce.number().int().min(0, "Reorder must be ≥ 0"),
  warehouse_location: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().max(40).nullable(),
  ),
});
export type InventoryMetaInputT = z.infer<typeof InventoryMetaInput>;
