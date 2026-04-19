import { z } from "zod";

/**
 * Phase 3.4 — edit-order Server Action input.
 *
 * Body shape: full list of lines representing the DESIRED state post-edit.
 * The action computes the diff against the current `order_items` and issues
 * the right insert / update / delete mix. Quantities must be ≥ 1; removing a
 * line means omitting its `product_id` from the submitted array.
 *
 * Per SPEC §8.9 + journal open question #2: a zero-line edit is rejected at
 * the action layer — the user should use the explicit Cancel action
 * instead.
 */
export const EditOrderInput = z.object({
  order_id: z.string().uuid(),
  /**
   * Optional ISO timestamp of `orders.last_edited_at` at the moment the
   * edit form was rendered. Used as an "if-match" concurrency guard so a
   * second editor doesn't clobber the first. `null` means "this is the
   * first edit" (journal open question #3 — concurrency guard).
   */
  last_edited_at_expected: z
    .preprocess((v) => (v === "" ? null : v), z.string().datetime().nullable())
    .optional()
    .default(null),
  notes: z.string().max(1000).optional().default(""),
  lines: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(9999),
      }),
    )
    .min(1, "An edited order must keep at least one line. Use Cancel to empty."),
});
export type EditOrderInputT = z.infer<typeof EditOrderInput>;
