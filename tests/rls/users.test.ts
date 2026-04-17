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

describe("users RLS", () => {
  it("user can read own profile", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { data, error } = await sb
      .from("users")
      .select("id")
      .eq("id", f.userBUser.id)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(f.userBUser.id);
  });

  it("user cannot read another branch's user", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { data, error } = await sb
      .from("users")
      .select("id")
      .eq("id", f.userAManager.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("super_admin reads any user", async () => {
    const sb = userClient(f.superAdmin.accessToken);
    const { data, error } = await sb
      .from("users")
      .select("id")
      .in("id", [f.userAManager.id, f.userBUser.id]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("direct insert to users is blocked by users_insert_block policy", async () => {
    const sb = userClient(f.userBUser.accessToken);
    const { error } = await sb.from("users").insert({
      id: crypto.randomUUID(),
      email: `forbidden_${Date.now()}@rls.test`,
    });
    expect(error).not.toBeNull();
  });
});
