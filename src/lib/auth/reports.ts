import type { RoleAssignment } from "@/lib/auth/roles";
import { isAdmin, isHqManager } from "@/lib/auth/roles";

/**
 * Phase 7b-2c — per-report access matrix.
 *
 * Single source of truth for who sees what. Page-level gates and the
 * index card visibility both read from here. CSV route handler uses
 * the same check before streaming bytes, so URL tampering can't leak
 * data.
 *
 * The split:
 *   - **spend-by-branch** — admin + HQ (ops cares about cross-branch spend).
 *   - **top-products** — admin + HQ (ops cares about what's moving).
 *   - **ar-aging** — admin only. Finance territory; HQ has no AR
 *     accountability and the per-branch payment history is sensitive.
 *   - **packer-throughput** — admin + HQ (warehouse ops metric).
 */

export const REPORT_KINDS = [
  "spend-by-branch",
  "top-products",
  "ar-aging",
  "packer-throughput",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value);
}

export function canSeeReport(
  kind: ReportKind,
  roles: readonly RoleAssignment[],
): boolean {
  if (isAdmin(roles)) return true;
  if (isHqManager(roles)) {
    // HQ sees everything except AR aging.
    return kind !== "ar-aging";
  }
  return false;
}

export function reportsVisibleTo(
  roles: readonly RoleAssignment[],
): ReportKind[] {
  return REPORT_KINDS.filter((k) => canSeeReport(k, roles));
}

export const REPORT_META: Record<
  ReportKind,
  { title: string; description: string; href: string }
> = {
  "spend-by-branch": {
    title: "Spend by branch",
    description:
      "Issued-or-later invoice totals per branch, over the selected window.",
    href: "/reports/spend-by-branch",
  },
  "top-products": {
    title: "Top products",
    description:
      "Approved order line value by SKU — what's moving through the catalog.",
    href: "/reports/top-products",
  },
  "ar-aging": {
    title: "AR aging",
    description:
      "Unpaid invoices bucketed by days overdue. Finance-only.",
    href: "/reports/ar-aging",
  },
  "packer-throughput": {
    title: "Packer throughput",
    description:
      "Pallets packed per packer over the selected window.",
    href: "/reports/packer-throughput",
  },
};
