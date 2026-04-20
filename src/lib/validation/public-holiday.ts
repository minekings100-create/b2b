import { z } from "zod";

/**
 * Phase 7b-2a — public_holidays validation.
 *
 * Matches the table shape from migration 20260420000001. `region` is
 * mostly aspirational today ('NL' only in the seed + default) but the
 * schema accepts any short code so a future regional calendar doesn't
 * need a migration.
 */

const regionSchema = z
  .string()
  .trim()
  .min(2, "Region code must be 2+ chars")
  .max(8)
  .default("NL");

// HTML5 date inputs submit YYYY-MM-DD. Accept that exactly — no parsing
// ambiguity, no timezone surprises. Postgres `date` column round-trips
// the same literal.
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const PublicHolidayCreateInput = z.object({
  region: regionSchema,
  date: dateSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
});
export type PublicHolidayCreateInputT = z.infer<
  typeof PublicHolidayCreateInput
>;

export const PublicHolidayUpdateInput = PublicHolidayCreateInput.extend({
  id: z.string().uuid(),
});
export type PublicHolidayUpdateInputT = z.infer<
  typeof PublicHolidayUpdateInput
>;

export const PublicHolidayDeleteInput = z.object({
  id: z.string().uuid(),
});
