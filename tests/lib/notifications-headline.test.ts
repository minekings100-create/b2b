import { describe, expect, it, vi, afterEach } from "vitest";
import { describeNotification } from "@/lib/notifications/headline";
import { formatAbsolute, relativeTime } from "@/lib/dates/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("relativeTime", () => {
  it("formats a few seconds ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T12:00:30Z"));
    expect(relativeTime("2026-04-19T12:00:00Z")).toBe("30 seconds ago");
  });

  it("formats minutes / hours / days / months past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T12:00:00Z"));
    expect(relativeTime("2026-04-19T11:45:00Z")).toBe("15 minutes ago");
    expect(relativeTime("2026-04-19T05:00:00Z")).toBe("7 hours ago");
    expect(relativeTime("2026-04-15T12:00:00Z")).toBe("4 days ago");
    expect(relativeTime("2026-01-19T12:00:00Z")).toBe("3 months ago");
  });

  it("singularises units (1 second / 1 minute / etc.)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T12:00:01Z"));
    expect(relativeTime("2026-04-19T12:00:00Z")).toBe("1 second ago");
  });

  it("handles future dates with 'from now' suffix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T12:00:00Z"));
    expect(relativeTime("2026-04-19T13:00:00Z")).toBe("1 hour from now");
  });
});

describe("formatAbsolute", () => {
  it("renders Europe/Amsterdam local wall-clock", () => {
    // 2026-04-19T10:00:00Z = 12:00 CEST (UTC+2)
    const out = formatAbsolute("2026-04-19T10:00:00Z");
    expect(out).toMatch(/12:00/);
    // nl-NL locale produces lowercase short month names ("apr", not "Apr").
    expect(out.toLowerCase()).toMatch(/19 apr 2026/);
  });
});

describe("describeNotification", () => {
  it("renders order_branch_approved with order number + 'awaiting your HQ' framing", () => {
    expect(
      describeNotification("order_branch_approved", {
        order_number: "ORD-2026-00042",
      }),
    ).toBe("Order ORD-2026-00042 branch-approved — awaiting your HQ decision");
  });

  it("renders order_approved as 'ready to pick' (final approval)", () => {
    expect(
      describeNotification("order_approved", { order_number: "ORD-1" }),
    ).toBe("Order ORD-1 HQ-approved — ready to pick");
  });

  it("step-tagged rejects mention the actor side + truncate long reasons", () => {
    expect(
      describeNotification("order_branch_rejected", {
        order_number: "ORD-1",
        reason: "Over budget",
      }),
    ).toBe("Order ORD-1 rejected by branch — Over budget");

    expect(
      describeNotification("order_hq_rejected", {
        order_number: "ORD-1",
        reason: "x".repeat(80),
      }),
    ).toMatch(/^Order ORD-1 rejected by HQ — x{59}…$/);

    expect(
      describeNotification("order_hq_rejected_to_branch_manager", {
        order_number: "ORD-1",
      }),
    ).toBe("HQ overruled your branch approval — ORD-1");
  });

  it("submitted_while_overdue surfaces both the order + the branch", () => {
    expect(
      describeNotification("order_submitted_while_overdue", {
        order_number: "ORD-1",
        branch_code: "RDM",
      }),
    ).toBe("Override: ORD-1 submitted by RDM despite overdue invoices");
  });

  it("auto_cancelled is a single line regardless of step", () => {
    expect(
      describeNotification("order_auto_cancelled", {
        order_number: "ORD-1",
        step: "branch",
      }),
    ).toBe("Order ORD-1 auto-cancelled (timeout)");
  });

  it("order_edited prompts re-approval", () => {
    expect(
      describeNotification("order_edited", {
        order_number: "ORD-99",
        line_delta: 1,
        total_delta_cents: 450,
      }),
    ).toBe("Order ORD-99 was edited — needs your re-approval");
  });

  it("digest reminders read as reminders, not order references", () => {
    expect(
      describeNotification("submitted_awaiting_branch_reminder", {}),
    ).toBe("Reminder: orders awaiting your branch approval");
    expect(
      describeNotification("branch_approved_awaiting_hq_reminder", {}),
    ).toBe("Reminder: orders awaiting HQ approval");
  });

  it("falls back to the raw type for unknown values", () => {
    expect(describeNotification("invoice_issue", {})).toBe("invoice issue");
  });
});
