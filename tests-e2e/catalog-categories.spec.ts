import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function signInAsSuper(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill("super@example.nl");
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

async function signInAsBranchUser(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").first().fill("ams.user1@example.nl");
  await page.getByLabel("Password").fill("demo-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.afterAll(async () => {
  const { data: victims } = await admin
    .from("product_categories")
    .select("id")
    .like("name", "E2E cat %");
  const ids = (victims ?? []).map((v) => v.id);
  if (ids.length === 0) return;
  await admin
    .from("audit_log")
    .delete()
    .eq("entity_type", "product_category")
    .in("entity_id", ids);
  await admin.from("product_categories").delete().in("id", ids);
});

test.describe("Phase 2.5 category CRUD", () => {
  test("super admin creates, edits, and archives a category", async ({
    page,
  }) => {
    const unique = Date.now();
    const name = `E2E cat ${unique}`;
    const renamed = `${name} renamed`;
    await signInAsSuper(page);
    await page.goto("/catalog/categories");
    await expect(
      page.getByRole("heading", { name: "Categories" }),
    ).toBeVisible();

    // --- Create --------------------------------------------------------
    await page.getByLabel("Order", { exact: true }).fill("900");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add category" }).click();

    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const { data: created } = await admin
      .from("product_categories")
      .select("id, sort_order")
      .eq("name", name)
      .is("deleted_at", null)
      .single();
    expect(created?.sort_order).toBe(900);

    const { data: createAudit } = await admin
      .from("audit_log")
      .select("action")
      .eq("entity_type", "product_category")
      .eq("entity_id", created!.id)
      .eq("action", "create");
    expect((createAudit ?? []).length).toBeGreaterThan(0);

    // --- Edit ---------------------------------------------------------
    await page
      .getByRole("button", { name: `Edit ${name}` })
      .click();
    const editRow = page.getByRole("row").filter({
      has: page.getByLabel("Name", { exact: true }).and(
        page.locator(`[value="${name}"]`),
      ),
    });
    const nameInput = editRow
      .getByLabel("Name", { exact: true });
    await nameInput.fill(renamed);
    await editRow.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: renamed, exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const { data: afterEdit } = await admin
      .from("product_categories")
      .select("name")
      .eq("id", created!.id)
      .single();
    expect(afterEdit?.name).toBe(renamed);

    // --- Archive ------------------------------------------------------
    await page.getByRole("button", { name: `Archive ${renamed}` }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();

    // Reload so we're reading from a fresh server render — the "cell
    // disappears" assertion would otherwise pass the moment the row
    // switches to the confirm-archive view, before the action commits.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("product_categories")
            .select("deleted_at")
            .eq("id", created!.id)
            .single();
          return data?.deleted_at ?? null;
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();

    await page.reload();
    await expect(
      page.getByRole("cell", { name: renamed, exact: true }),
    ).toHaveCount(0);
  });

  test("duplicate category name surfaces field error", async ({ page }) => {
    const unique = Date.now();
    const name = `E2E cat dup ${unique}`;
    await admin
      .from("product_categories")
      .insert({ name, sort_order: 999 })
      .select("id")
      .single();

    await signInAsSuper(page);
    await page.goto("/catalog/categories");
    await page.getByLabel("Order", { exact: true }).fill("0");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add category" }).click();

    await expect(page.getByText(`Category "${name}" already exists`)).toBeVisible(
      { timeout: 10_000 },
    );
  });

  test("branch user cannot access the categories page", async ({ page }) => {
    await signInAsBranchUser(page);
    await page.goto("/catalog/categories");
    await expect(page).toHaveURL(/\/catalog($|\?)/);
    await expect(
      page.getByRole("heading", { name: "Categories" }),
    ).toHaveCount(0);
  });
});
