import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(projectRoot, ...parts), "utf8");
const route = read("src/routes/admin/integrations.tsx");
const functions = read("src/lib/admin-integrations.functions.ts");
const server = read("src/lib/admin-integrations.server.ts");
const badge = read("src/components/admin/admin-status-badge.tsx");

describe("admin integrations health", () => {
  it("replaces the old mock integrations view with authenticated real health checks", () => {
    expect(route).toContain("getAdminIntegrationStatuses");
    expect(route).not.toContain("INTEGRATIONS =");
    expect(route).not.toContain("טרם חובר");
    expect(route).not.toContain("אין חיבור בפועל");
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain("requireTipulinksAdmin(context.claims");
    expect(functions).toContain('import("./admin-integrations.server")');
  });

  it("checks all current external services and preserves planned placeholders", () => {
    for (const service of [
      'key: "supabase"',
      'key: "openai"',
      'key: "twilio"',
      'key: "meta-whatsapp"',
      'key: "brevo"',
      'key: "zoho"',
      'key: "data-gov"',
      'key: "lovable"',
      '"google-analytics"',
      '"payment"',
    ]) {
      expect(server).toContain(service);
    }
  });

  it("uses non-delivering provider checks and never sends probe messages or calls", () => {
    expect(server).toContain("https://api.openai.com/v1/models/");
    expect(server).toContain("https://api.brevo.com/v3/account");
    expect(server).toContain("/ApprovalRequests");
    expect(server).toContain("datastore_search");
    expect(server).toContain("/Calls.json");
    expect(server).toContain('body: ""');
    expect(server).not.toContain("/v1/responses");
    expect(server).not.toContain("/Messages.json");
  });

  it("validates the live Voice key and WhatsApp Sender without weakening production credentials", () => {
    expect(server).toContain("basicAuth(config.apiKeySid, config.apiKeySecret)");
    expect(server).toContain("Calls — Create");
    expect(server).toContain("https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=1000");
    expect(server).toContain('senderStatus === "ONLINE"');
  });

  it("treats interactive OAuth checks as neutral rather than permanent warnings", () => {
    expect(server).toContain('label: "Google OAuth"');
    expect(server).toContain('label: "Apple OAuth"');
    expect(server).toContain('state: "unchecked"');
    expect(route).toContain('unchecked: "לא נבדק"');
    expect(badge).toContain('"לא נבדק": "neutral"');
  });

  it("supports the shared healthy warning error and planned badge vocabulary", () => {
    expect(badge).toContain('תקין: "positive"');
    expect(badge).toContain('אזהרה: "pending"');
    expect(badge).toContain('שגיאה: "negative"');
    expect(badge).toContain('מתוכנן: "neutral"');
  });
});
