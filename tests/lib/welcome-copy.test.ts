import { describe, it, expect } from "vitest";
import { welcomeFor } from "@/lib/welcome/copy";
import type { RoleAssignment } from "@/lib/auth/roles";

/**
 * Priority resolution is the non-obvious bit: a user holding both
 * super_admin and packer should see the super_admin welcome (the most
 * elevated role wins). Covers the 6 defined roles + the defensive
 * fallback for the (shouldn't-happen) empty-roles case.
 */

const r = (role: string, branch_id: string | null = null): RoleAssignment =>
  ({ role, branch_id } as unknown as RoleAssignment);

describe("welcomeFor", () => {
  it("returns super_admin copy when super_admin is present (highest priority)", () => {
    const out = welcomeFor([r("super_admin"), r("packer")]);
    expect(out.title).toMatch(/super admin/i);
  });

  it("returns administration copy for administration role", () => {
    const out = welcomeFor([r("administration")]);
    expect(out.title).toMatch(/administration/i);
    expect(out.body).toMatch(/invoices/i);
  });

  it("returns hq_operations_manager copy", () => {
    const out = welcomeFor([r("hq_operations_manager")]);
    expect(out.title).toMatch(/hq/i);
  });

  it("returns branch_manager copy when only branch_manager is held", () => {
    const out = welcomeFor([r("branch_manager", "b1")]);
    expect(out.title).toMatch(/branch manager/i);
  });

  it("returns packer copy when only packer is held", () => {
    const out = welcomeFor([r("packer")]);
    expect(out.title).toMatch(/packing/i);
  });

  it("returns branch_user copy when only branch_user is held", () => {
    const out = welcomeFor([r("branch_user", "b1")]);
    expect(out.title).toMatch(/Bessems/i);
  });

  it("prefers branch_manager over branch_user when the user holds both", () => {
    const out = welcomeFor([
      r("branch_user", "b1"),
      r("branch_manager", "b2"),
    ]);
    expect(out.title).toMatch(/branch manager/i);
  });

  it("falls back to a neutral welcome when the list is empty", () => {
    const out = welcomeFor([]);
    expect(out.title).toMatch(/welcome/i);
    expect(out.body.length).toBeGreaterThan(0);
  });
});
