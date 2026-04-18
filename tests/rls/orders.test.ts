import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupFixture,
  seedFixture,
  userClient,
  type TestFixture,
} from "./setup";

/**
 * Sub-milestone 3.2.2a — RLS guarantees for the new HQ Manager role + the
 * narrowed packer visibility. These tests are the regression guard called
 * out in the user's brief: if anyone ever loosens packer RLS or weakens the
 * HQ scope, these break loudly.
 */

let f: TestFixture;

beforeAll(async () => {
  f = await seedFixture();
});

afterAll(async () => {
  await cleanupFixture(f);
});

describe("orders RLS — HQ Manager", () => {
  it("HQ Manager sees orders across both branches", async () => {
    const sb = userClient(f.hqManager.accessToken);
    const { data, error } = await sb
      .from("orders")
      .select("id, status, branch_id")
      .in("branch_id", [f.branchA.id, f.branchB.id]);
    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((o) => o.id));
    // Every fixture order on either branch is visible.
    for (const o of Object.values(f.orders)) {
      expect(ids.has(o.id)).toBe(true);
    }
  });

  it("HQ Manager has no branch_id assigned (sanity check)", async () => {
    const { data } = await userClient(f.hqManager.accessToken)
      .from("user_branch_roles")
      .select("role, branch_id");
    expect(data?.length).toBe(1);
    expect(data?.[0]?.role).toBe("hq_operations_manager");
    expect(data?.[0]?.branch_id).toBeNull();
  });
});

describe("orders RLS — packer narrowing (3.2.2a regression guard)", () => {
  it("packer sees orders only in fulfilment-stage statuses", async () => {
    const sb = userClient(f.packer.accessToken);
    const { data, error } = await sb
      .from("orders")
      .select("id, status, branch_id")
      .in("branch_id", [f.branchA.id, f.branchB.id]);
    expect(error).toBeNull();

    const visibleStatuses = new Set((data ?? []).map((o) => o.status));
    const ALLOWED = new Set([
      "approved",
      "picking",
      "packed",
      "shipped",
      "delivered",
    ]);

    // Every status the packer can see must be in the allowed set. If anyone
    // ever broadens orders_select for packer, this assertion catches it.
    for (const s of visibleStatuses) {
      expect(ALLOWED.has(s)).toBe(true);
    }

    const visibleIds = new Set((data ?? []).map((o) => o.id));
    // Submitted + branch_approved fixtures must be hidden from the packer.
    expect(visibleIds.has(f.orders.aSubmitted.id)).toBe(false);
    expect(visibleIds.has(f.orders.aBranchApproved.id)).toBe(false);
    expect(visibleIds.has(f.orders.bSubmitted.id)).toBe(false);
    // Fulfilment-stage fixtures (approved + picking on branch A,
    // approved on branch B) must be visible — packers are global.
    expect(visibleIds.has(f.orders.aApproved.id)).toBe(true);
    expect(visibleIds.has(f.orders.aPicking.id)).toBe(true);
    expect(visibleIds.has(f.orders.bApproved.id)).toBe(true);
  });
});
