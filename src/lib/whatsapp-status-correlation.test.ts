import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../supabase/migrations/20260830050000_whatsapp_status_callback_correlation.sql",
  ),
  "utf8",
);
const routeSource = readFileSync(
  join(import.meta.dir, "../routes/api/public/whatsapp/lead-status.ts"),
  "utf8",
);
const functionsSource = readFileSync(join(import.meta.dir, "whatsapp-lead.functions.ts"), "utf8");

describe("WhatsApp status callback correlation", () => {
  it("passes the pre-created delivery id into the Twilio send", () => {
    expect(functionsSource).toContain("deliveryId,");
  });

  it("reads the signed delivery id from the callback URL and passes it to the RPC", () => {
    expect(routeSource).toContain('searchParams.get("delivery_id")');
    expect(routeSource).toContain("_delivery_id: deliveryId");
  });

  it("can attach MessageSid by delivery id before the normal post-send attach runs", () => {
    expect(migration).toContain("where id = _delivery_id");
    expect(migration).toContain("if v_delivery.message_sid is null then");
    expect(migration).toContain("set message_sid = _message_sid");
  });

  it("rejects a delivery-id / MessageSid mismatch rather than cross-correlating leads", () => {
    expect(migration).toContain("v_delivery.id <> _delivery_id");
    expect(migration).toContain("v_delivery.message_sid <> _message_sid");
  });

  it("preserves legacy callback compatibility when no delivery id is present", () => {
    expect(migration).toContain("_delivery_id uuid default null");
    expect(migration).toContain("where message_sid = _message_sid");
  });

  it("preserves delivered-only billing and terminal-failure reservation release", () => {
    expect(migration).toContain("elsif v_status = 'delivered' then");
    expect(migration).toContain("commit_monthly_budget_reservation");
    expect(migration).toContain("if v_commit_allowed then");
    expect(migration).toContain("elsif v_status in ('failed', 'undelivered') then");
    expect(migration).toContain("release_monthly_budget_reservation");
  });
});
