import { z } from "zod";

export const BarcodeAddInput = z.object({
  product_id: z.string().uuid(),
  barcode: z
    .string()
    .min(4, "Barcode must be ≥ 4 chars")
    .max(64, "Barcode must be ≤ 64 chars")
    .regex(/^[A-Za-z0-9\-_.]+$/, "Only letters, digits, dash, dot, underscore"),
  unit_multiplier: z.coerce.number().int().min(1, "Multiplier ≥ 1").default(1),
});
export type BarcodeAddInputT = z.infer<typeof BarcodeAddInput>;

export const BarcodeRemoveInput = z.object({
  id: z.string().uuid(),
});
