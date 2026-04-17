import { describe, expect, it } from "vitest";
import {
  branchesForRole,
  hasAnyRole,
  hasRole,
  isAdmin,
  type RoleAssignment,
} from "@/lib/auth/roles";

const manager: RoleAssignment  = { role: "branch_manager", branch_id: "b1" };
const user:    RoleAssignment  = { role: "branch_user",    branch_id: "b2" };
const admin:   RoleAssignment  = { role: "super_admin",    branch_id: null };

describe("role helpers", () => {
  it("hasRole returns true when role present", () => {
    expect(hasRole([manager, user], "branch_manager")).toBe(true);
    expect(hasRole([manager, user], "packer")).toBe(false);
  });

  it("hasAnyRole matches union", () => {
    expect(hasAnyRole([user], ["branch_manager", "super_admin"])).toBe(false);
    expect(hasAnyRole([admin], ["branch_manager", "super_admin"])).toBe(true);
  });

  it("branchesForRole returns branch ids for matching role", () => {
    expect(branchesForRole([manager, user], "branch_manager")).toEqual(["b1"]);
    expect(branchesForRole([admin], "branch_manager")).toEqual([]);
  });

  it("branchesForRole ignores null branch_id (global admins)", () => {
    expect(branchesForRole([admin, manager], "super_admin")).toEqual([]);
  });

  it("isAdmin detects super_admin or administration", () => {
    expect(isAdmin([manager])).toBe(false);
    expect(isAdmin([admin])).toBe(true);
    expect(isAdmin([{ role: "administration", branch_id: null }])).toBe(true);
  });
});
