import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { SeededOrder } from "./orders";
import type { SeededInvoice } from "./billing";
import type { SeededReturn } from "./returns";
import { daysBefore, DEMO_FLAG, pickOne, seedRand } from "./util";

type AdminClient = SupabaseClient<Database>;
type UserLite = { id: string; email: string };

type AuditRow = {
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  before_json: Json | null;
  after_json: Json | null;
  created_at: string;
};

/**
 * Emit audit_log rows for each demo entity's state transitions so the
 * (future) Phase-7 audit viewer has realistic content. Every row is marked
 * with `"_demo": true` inside `after_json` so `wipe` can remove them.
 */
export async function seedAuditLog(
  supabase: AdminClient,
  orders: SeededOrder[],
  invoices: SeededInvoice[],
  returns: SeededReturn[],
  packers: UserLite[],
  admins: UserLite[],
  now: Date,
): Promise<void> {
  console.log("→ seeding audit_log");
  const rand = seedRand(311);
  const rows: AuditRow[] = [];

  const tag = (after: { [k: string]: Json }): Json =>
    ({ ...after, ...DEMO_FLAG }) as Json;

  // Order transitions.
  for (const o of orders) {
    const creator = o.created_by_user_id;

    rows.push({
      entity_type: "order",
      entity_id: o.id,
      action: "create",
      actor_user_id: creator,
      before_json: null,
      after_json: tag({ order_number: o.order_number, status: "draft", branch_id: o.branch_id }),
      created_at: o.created_at,
    });

    if (o.submitted_at) {
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "submit",
        actor_user_id: creator,
        before_json: { status: "draft" },
        after_json: tag({ status: "submitted" }),
        created_at: o.submitted_at,
      });
    }

    if (o.status === "rejected") {
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "reject",
        actor_user_id: o.approved_by_user_id,
        before_json: { status: "submitted" },
        after_json: tag({ status: "rejected" }),
        created_at: o.approved_at ?? o.submitted_at ?? o.created_at,
      });
      continue;
    }

    // Step 1 — Branch Manager approval (3.2.2). Synthetic for legacy
    // single-step rows is handled by the migration; this path covers
    // demo orders generated *with* a branch_approved_at.
    if (o.branch_approved_at) {
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "branch_approve",
        actor_user_id: o.branch_approved_by_user_id,
        before_json: { status: "submitted" },
        after_json: tag({ status: "branch_approved" }),
        created_at: o.branch_approved_at,
      });
    }

    // Step 2 — HQ Manager approval. `approve` action name is preserved
    // for the final approval to keep the legacy audit trail readable;
    // 3.2.2b will introduce `hq_approve` for new flows.
    if (o.approved_at) {
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "approve",
        actor_user_id: o.approved_by_user_id,
        before_json: {
          status: o.branch_approved_at ? "branch_approved" : "submitted",
        },
        after_json: tag({ status: "approved" }),
        created_at: o.approved_at,
      });
    }

    if (["picking", "packed", "shipped", "delivered", "closed"].includes(o.status)) {
      const packer = packers.length > 0 ? pickOne(rand, packers) : null;
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "picking",
        actor_user_id: packer?.id ?? null,
        before_json: { status: "approved" },
        after_json: tag({ status: "picking" }),
        created_at: o.approved_at ?? o.created_at,
      });
    }

    if (["packed", "shipped", "delivered", "closed"].includes(o.status)) {
      const packer = packers.length > 0 ? pickOne(rand, packers) : null;
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "packed",
        actor_user_id: packer?.id ?? null,
        before_json: { status: "picking" },
        after_json: tag({ status: "packed" }),
        created_at: o.approved_at ?? o.created_at,
      });
    }

    if (["shipped", "delivered", "closed"].includes(o.status)) {
      const admin = admins.length > 0 ? pickOne(rand, admins) : null;
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "ship",
        actor_user_id: admin?.id ?? null,
        before_json: { status: "packed" },
        after_json: tag({ status: "shipped" }),
        created_at: o.approved_at ?? o.created_at,
      });
    }

    if (["delivered", "closed"].includes(o.status)) {
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "deliver",
        actor_user_id: creator,
        before_json: { status: "shipped" },
        after_json: tag({ status: "delivered" }),
        created_at: o.approved_at ?? o.created_at,
      });
    }

    if (o.status === "closed") {
      const admin = admins.length > 0 ? pickOne(rand, admins) : null;
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "close",
        actor_user_id: admin?.id ?? null,
        before_json: { status: "delivered" },
        after_json: tag({ status: "closed" }),
        created_at: daysBefore(now, 1 + Math.floor(rand() * 5)),
      });
    }

    if (o.status === "cancelled") {
      const admin = admins.length > 0 ? pickOne(rand, admins) : null;
      rows.push({
        entity_type: "order",
        entity_id: o.id,
        action: "cancel",
        actor_user_id: admin?.id ?? creator,
        before_json: { status: "approved" },
        after_json: tag({ status: "cancelled" }),
        created_at: o.approved_at ?? o.submitted_at ?? o.created_at,
      });
    }
  }

  // Invoice transitions.
  for (const inv of invoices) {
    const admin = admins.length > 0 ? pickOne(rand, admins) : null;
    const actor = admin?.id ?? null;
    rows.push({
      entity_type: "invoice",
      entity_id: inv.id,
      action: "draft",
      actor_user_id: actor,
      before_json: null,
      after_json: tag({ invoice_number: inv.invoice_number, status: "draft" }),
      created_at: inv.issued_at ?? daysBefore(now, 10),
    });
    if (inv.status === "issued" || inv.status === "paid" || inv.status === "overdue" || inv.status === "cancelled") {
      rows.push({
        entity_type: "invoice",
        entity_id: inv.id,
        action: "issue",
        actor_user_id: actor,
        before_json: { status: "draft" },
        after_json: tag({ status: "issued" }),
        created_at: inv.issued_at ?? daysBefore(now, 8),
      });
    }
    if (inv.status === "paid" && inv.paid_at) {
      rows.push({
        entity_type: "invoice",
        entity_id: inv.id,
        action: "pay",
        actor_user_id: actor,
        before_json: { status: "issued" },
        after_json: tag({ status: "paid", method: inv.payment_method }),
        created_at: inv.paid_at,
      });
    }
    if (inv.status === "overdue") {
      rows.push({
        entity_type: "invoice",
        entity_id: inv.id,
        action: "overdue",
        actor_user_id: null, // cron job — no actor
        before_json: { status: "issued" },
        after_json: tag({ status: "overdue" }),
        created_at: daysBefore(now, 1),
      });
    }
    if (inv.status === "cancelled") {
      rows.push({
        entity_type: "invoice",
        entity_id: inv.id,
        action: "cancel",
        actor_user_id: actor,
        before_json: { status: "issued" },
        after_json: tag({ status: "cancelled" }),
        created_at: daysBefore(now, 2 + Math.floor(rand() * 5)),
      });
    }
  }

  // Return transitions.
  for (const r of returns) {
    const admin = admins.length > 0 ? pickOne(rand, admins) : null;
    const actor = admin?.id ?? null;
    rows.push({
      entity_type: "return",
      entity_id: r.id,
      action: "request",
      actor_user_id: null,
      before_json: null,
      after_json: tag({ rma_number: r.rma_number, status: "requested" }),
      created_at: daysBefore(now, 15),
    });
    if (r.status === "received" || r.status === "processed") {
      rows.push({
        entity_type: "return",
        entity_id: r.id,
        action: "approve",
        actor_user_id: actor,
        before_json: { status: "requested" },
        after_json: tag({ status: "approved" }),
        created_at: daysBefore(now, 13),
      });
      rows.push({
        entity_type: "return",
        entity_id: r.id,
        action: "receive",
        actor_user_id: actor,
        before_json: { status: "approved" },
        after_json: tag({ status: "received" }),
        created_at: daysBefore(now, 10),
      });
    }
    if (r.status === "processed") {
      rows.push({
        entity_type: "return",
        entity_id: r.id,
        action: "process",
        actor_user_id: actor,
        before_json: { status: "received" },
        after_json: tag({ status: "processed" }),
        created_at: daysBefore(now, 5),
      });
    }
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("audit_log").insert(chunk);
    if (error) throw error;
  }
  console.log(`  inserted ${rows.length} audit_log entries`);
}
