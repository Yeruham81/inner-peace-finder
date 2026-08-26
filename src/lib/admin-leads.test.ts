import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(import.meta.dir, "..", "routes", "admin", "leads.tsx"), "utf8");
const functions = readFileSync(join(import.meta.dir, "admin-leads.functions.ts"), "utf8");

describe("admin leads", () => {
  it("loads real lead rows instead of admin mock data", () => {
    expect(route).toContain("listAdminLeads");
    expect(route).not.toContain("MOCK_LEADS");
    expect(route).not.toContain("נתוני הדגמה");
    expect(functions).toContain('.from("lead_events")');
  });

  it("keeps production lead access behind authenticated admin server code", () => {
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain("requireTipulinksAdmin(context.claims");
    expect(functions).toContain('import("@/integrations/supabase/client.server")');
  });

  it("uses real operational metadata and does not invent a status timeline", () => {
    expect(route).toContain("selected.deliveryStatus");
    expect(route).toContain("selected.providerMessageId");
    expect(route).toContain("selected.ctaEventId");
    expect(route).not.toContain("history.map");
    expect(route).not.toContain("req_mock_");
  });

  it("derives the public source from the existing CTA analytics without exposing raw sessions", () => {
    expect(functions).toContain('.from("analytics_events")');
    expect(functions).toContain('.eq("event_name", "cta_clicked")');
    expect(functions).toContain("hashValue(lead.session_id)");
    expect(functions).not.toContain("sessionId:");
  });
});
