import { describe, it, expect } from "vitest";
import { ProductCreateInput } from "@/lib/validation/product";

/**
 * Post-MVP Sprint 3 — variant-label / variant-group cross-field rule.
 *
 * A `variant_label` without a `variant_group_id` is meaningless for the
 * catalog UI (a single-product group has no sibling to switch to) and
 * is also rejected at the Postgres layer via
 * `products_variant_label_requires_group` CHECK. Zod mirrors the rule so
 * the server action returns a friendly field error instead of a 500.
 */

const BASE = {
  sku: "SKU-TEST-001",
  name: "Test product",
  description: "",
  category_id: "",
  unit: "piece",
  unit_price_cents: 100,
  vat_rate: 21,
  min_order_qty: 1,
  max_order_qty: "",
};

describe("ProductCreateInput — variant label/group rule", () => {
  it("accepts a product with neither group nor label (ungrouped, the default case)", () => {
    const out = ProductCreateInput.safeParse({
      ...BASE,
      variant_group_id: "",
      variant_label: "",
    });
    expect(out.success).toBe(true);
  });

  it("accepts a product with both group and label set", () => {
    const out = ProductCreateInput.safeParse({
      ...BASE,
      variant_group_id: "11111111-1111-4111-8111-111111111111",
      variant_label: "500ml",
    });
    expect(out.success).toBe(true);
  });

  it("rejects a product with a label but no group", () => {
    const out = ProductCreateInput.safeParse({
      ...BASE,
      variant_group_id: "",
      variant_label: "500ml",
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const paths = out.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("variant_label");
    }
  });

  it("accepts a product with a group but no label (valid — label can be added later)", () => {
    const out = ProductCreateInput.safeParse({
      ...BASE,
      variant_group_id: "11111111-1111-4111-8111-111111111111",
      variant_label: "",
    });
    expect(out.success).toBe(true);
  });

  it("rejects an invalid UUID in variant_group_id", () => {
    const out = ProductCreateInput.safeParse({
      ...BASE,
      variant_group_id: "not-a-uuid",
      variant_label: "",
    });
    expect(out.success).toBe(false);
  });
});
