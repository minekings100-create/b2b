import { z } from "zod";

/**
 * Phase 7b-2b — branch archive/restore input schemas. Create/update
 * live elsewhere and are out of scope for this PR.
 */

export const BranchArchiveInput = z.object({ id: z.string().uuid() });
export type BranchArchiveInputT = z.infer<typeof BranchArchiveInput>;
