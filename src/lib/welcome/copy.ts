import type { RoleAssignment, UserRole } from "@/lib/auth/roles";

/**
 * Post-MVP Sprint 3 — first-login welcome copy per role.
 *
 * Resolution order when a user holds multiple roles (it's legal per §5):
 * super_admin > administration > hq_operations_manager > branch_manager >
 * packer > branch_user. The most elevated role wins so we don't show
 * a first-time branch-user a "welcome, browse the catalog" when they're
 * actually a super admin.
 */

export type WelcomeContent = {
  title: string;
  body: string;
};

const PRIORITY: UserRole[] = [
  "super_admin",
  "administration",
  "hq_operations_manager",
  "branch_manager",
  "packer",
  "branch_user",
];

const COPY: Record<UserRole, WelcomeContent> = {
  super_admin: {
    title: "Welcome, super admin",
    body: "Full system access. Use with care — most destructive actions are audited and visible to the whole team.",
  },
  administration: {
    title: "Welcome to administration",
    body: "Manage invoices, payments, and branch users. Bulk-send reminders for overdue invoices from the overdue view.",
  },
  hq_operations_manager: {
    title: "Welcome, HQ manager",
    body: "You see all branch orders after branch-level approval. Approve or reject to move them into packing.",
  },
  branch_manager: {
    title: "Welcome, branch manager",
    body: "You can approve or reject orders from your branch. The approval queue shows what's waiting on you.",
  },
  packer: {
    title: "Welcome to packing",
    body: "Pick orders from the pack queue. Claim an order to start, then scan barcodes to pack.",
  },
  branch_user: {
    title: "Welcome to Bessems Procurement",
    body: "Start by browsing the catalog and adding items to your cart. Orders need branch manager + HQ approval before fulfillment.",
  },
};

export function welcomeFor(
  assignments: readonly RoleAssignment[],
): WelcomeContent {
  for (const role of PRIORITY) {
    if (assignments.some((a) => a.role === role)) return COPY[role];
  }
  // Defensive fallback — a signed-in user should always have at least one
  // role, but keep a neutral message so the overlay never renders blank.
  return {
    title: "Welcome",
    body: "Use the sidebar on the left to navigate. Your available actions depend on the roles assigned to your account.",
  };
}
