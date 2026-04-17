import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupFixture,
  seedFixture,
  userClient,
  type TestFixture,
} from "./setup";

let f: TestFixture;

beforeAll(async () => {
  f = await seedFixture();
});

afterAll(async () => {
  await cleanupFixture(f);
});

describe("branches RLS", () => {
  it("manager of branch A cannot read branch B", async () => {
    const sb = userClient(f.userAManager.accessToken);
    const { data, error } = await sb.from("branches").select("id").eq("id", f.branchB.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user of branch B cannot read branch A", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { data, error } = await sb.from("branches").select("id").eq("id", f.branchA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("manager can read own branch", async () => {
    const sb = userClient(f.userAManager.accessToken);
    const { data, error } = await sb.from("branches").select("id").eq("id", f.branchA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("super_admin reads both branches", async () => {
    const sb = userClient(f.superAdmin.accessToken);
    const { data, error } = await sb
      .from("branches")
      .select("id")
      .in("id", [f.branchA.id, f.branchB.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("non-admin cannot insert a branch", async () => {
    const sb = userClient(f.userAManager.accessToken);
    const { error } = await sb
      .from("branches")
      .insert({ name: "Rogue", branch_code: `ROGUE-${Date.now()}` });
    expect(error).not.toBeNull();
  });
});
