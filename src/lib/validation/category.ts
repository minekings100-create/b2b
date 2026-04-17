import { z } from "zod";

/**
 * Categories are flat in Phase 2.5 — `parent_id` stays in the schema (SPEC
 * §6) but the UI doesn't expose nesting yet.
 */

export const CategoryCreateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  sort_order: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : v),
    z.coerce.number().int().min(0, "Sort order must be ≥ 0"),
  ),
});
export type CategoryCreateInputT = z.infer<typeof CategoryCreateInput>;

export const CategoryUpdateInput = CategoryCreateInput.extend({
  id: z.string().uuid(),
});
export type CategoryUpdateInputT = z.infer<typeof CategoryUpdateInput>;

export const CategoryArchiveInput = z.object({
  id: z.string().uuid(),
});
