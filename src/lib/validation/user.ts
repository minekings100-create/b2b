import { z } from "zod";

/**
 * Phase 7b-2b — user archive/restore input schemas. Create/update
 * live elsewhere (auth provisioning is a separate phase) and are out
 * of scope for this PR.
 */

export const UserArchiveInput = z.object({ id: z.string().uuid() });
export type UserArchiveInputT = z.infer<typeof UserArchiveInput>;
