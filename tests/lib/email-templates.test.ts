import { describe, expect, it } from "vitest";
import {
  renderAwaitingApprovalReminder,
  renderAwaitingHqApprovalReminder,
  renderOrderApproved,
  renderOrderAutoCancelled,
  renderOrderBranchApproved,
  renderOrderCancelled,
  renderOrderHqRejectedToBranchManager,
  renderOrderRejected,
  renderOrderSubmitted,
  renderOrderSubmittedWhileOverdue,
} from "@/lib/email/templates";

/**
 * Render-level guarantees: subject contains the order number, plain-text
 * fallback contains the human-meaningful payload bits, HTML escapes user
 * input. We deliberately don't snapshot full markup — 3.3.3 will rewrite
 * the layout and we don't want the snapshot churn here.
 */

describe("email templates", () => {
  it("order_submitted carries the order number + total + submitter", () => {
    const r = renderOrderSubmitted({
      order_id: "00000000-0000-0000-0000-000000000001",
      order_number: "ORD-2026-00042",
      branch_code: "AMS",
      branch_name: "Amsterdam",
      submitter_email: "ams.user1@example.nl",
      total_gross_cents: 12345,
      item_count: 3,
    });
    expect(r.subject).toContain("ORD-2026-00042");
    expect(r.subject).toContain("AMS");
    expect(r.text).toContain("ams.user1@example.nl");
    expect(r.text).toMatch(/€\s?123,45/);
    expect(r.text).toContain("3");
    expect(r.html).toContain("ORD-2026-00042");
    expect(r.html).toContain("/orders/00000000-0000-0000-0000-000000000001");
  });

  it("order_submitted_while_overdue surfaces overdue counts", () => {
    const r = renderOrderSubmittedWhileOverdue({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "RDM",
      branch_name: "Rotterdam",
      submitter_email: "u@x.nl",
      outstanding_count: 2,
      outstanding_total_cents: 50000,
    });
    expect(r.subject).toMatch(/Override/i);
    expect(r.subject).toContain("RDM");
    expect(r.text).toContain("2");
    expect(r.text).toMatch(/€\s?500,00/);
  });

  it("order_approved flags backorder when set", () => {
    const yes = renderOrderApproved({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      branch_name: "A",
      approver_email: "m@x.nl",
      item_count: 4,
      has_backorder: true,
    });
    const no = renderOrderApproved({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      branch_name: "A",
      approver_email: "m@x.nl",
      item_count: 4,
      has_backorder: false,
    });
    expect(yes.subject).toMatch(/backorder/i);
    expect(no.subject).not.toMatch(/backorder/i);
  });

  it("order_rejected escapes the reason", () => {
    const r = renderOrderRejected({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      reason: 'Over budget <script>alert("xss")</script>',
      rejecter_email: "m@x.nl",
    });
    expect(r.text).toContain('Over budget <script>alert("xss")</script>');
    expect(r.html).not.toContain("<script>alert");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("order_cancelled mentions prior status", () => {
    const r = renderOrderCancelled({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      branch_name: "A",
      prior_status: "approved",
      canceller_email: "m@x.nl",
      reason: "Stockout",
    });
    expect(r.subject).toContain("approved");
    expect(r.text).toContain("Stockout");
  });

  it("order_branch_approved (3.2.2 step-1 → step-2 handoff) carries branch + approver", () => {
    const r = renderOrderBranchApproved({
      order_id: "id",
      order_number: "ORD-2026-00099",
      branch_code: "AMS",
      branch_name: "Amsterdam",
      branch_approver_email: "ams.mgr@example.nl",
      item_count: 4,
      total_gross_cents: 9876,
      has_backorder: false,
    });
    expect(r.subject).toContain("ORD-2026-00099");
    expect(r.subject).toContain("AMS");
    expect(r.subject).toMatch(/awaiting HQ/i);
    expect(r.text).toContain("ams.mgr@example.nl");
  });

  it("order_hq_rejected_to_branch_manager carries 'overruled' framing + reason", () => {
    const r = renderOrderHqRejectedToBranchManager({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      reason: "Supplier price renegotiation pending.",
      rejecter_email: "hq.ops@example.nl",
    });
    expect(r.subject).toMatch(/overruled/i);
    expect(r.text).toContain("Supplier price renegotiation");
    expect(r.html).toContain("HQ overruled");
  });

  it("order_auto_cancelled subject + body adapt to step", () => {
    const branch = renderOrderAutoCancelled({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      branch_name: "Amsterdam",
      step: "branch",
      waited_days: 2,
    });
    expect(branch.subject).toMatch(/branch approval/i);
    expect(branch.text).toContain("2 working days");
    expect(branch.text).toMatch(/no reservations|hadn't completed/i);

    const hq = renderOrderAutoCancelled({
      order_id: "id",
      order_number: "ORD-1",
      branch_code: "AMS",
      branch_name: "Amsterdam",
      step: "hq",
      waited_days: 3,
    });
    expect(hq.subject).toMatch(/HQ approval/i);
    expect(hq.text).toContain("3 working days");
    expect(hq.text).toMatch(/released/i);
  });

  it("branch_approved_awaiting_hq_reminder lists waiting orders cross-branch", () => {
    const r = renderAwaitingHqApprovalReminder({
      manager_email: "hq.ops@example.nl",
      orders: [
        {
          order_id: "id-1",
          order_number: "ORD-2026-00010",
          branch_code: "AMS",
          branch_approved_at: "2026-04-17T10:00:00Z",
          item_count: 3,
          total_gross_cents: 5000,
        },
        {
          order_id: "id-2",
          order_number: "ORD-2026-00011",
          branch_code: "RDM",
          branch_approved_at: "2026-04-17T12:00:00Z",
          item_count: 6,
          total_gross_cents: 8000,
        },
      ],
    });
    expect(r.subject).toMatch(/awaiting HQ approval/i);
    expect(r.text).toContain("ORD-2026-00010");
    expect(r.text).toContain("AMS");
    expect(r.text).toContain("RDM");
    expect(r.html).toContain("/approvals");
  });

  it("awaiting_approval_reminder digest lists every waiting order", () => {
    const r = renderAwaitingApprovalReminder({
      branch_code: "AMS",
      branch_name: "Amsterdam",
      manager_email: "m@x.nl",
      orders: [
        {
          order_id: "id-1",
          order_number: "ORD-2026-00001",
          submitted_at: "2026-04-17T10:00:00Z",
          item_count: 3,
          total_gross_cents: 5000,
        },
        {
          order_id: "id-2",
          order_number: "ORD-2026-00002",
          submitted_at: "2026-04-17T11:00:00Z",
          item_count: 5,
          total_gross_cents: 7500,
        },
      ],
    });
    expect(r.subject).toContain("2");
    expect(r.subject).toContain("AMS");
    expect(r.text).toContain("ORD-2026-00001");
    expect(r.text).toContain("ORD-2026-00002");
    expect(r.html).toContain("/approvals");
  });
});
