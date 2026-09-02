import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractSupportTicketCode, htmlEmailToText, supportTicketSubject } from "./zoho-mail.server";

const projectRoot = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(projectRoot, ...parts), "utf8");
const migration = read("supabase/migrations/20260902072000_support_mailbox_integration.sql");
const adminFunctions = read("src/lib/admin-support.functions.ts");
const adminRoute = read("src/routes/admin/support.tsx");
const settingsRoute = read("src/routes/_authenticated/account.settings.tsx");
const credentialsRoute = read("src/routes/_authenticated/account.credentials.tsx");
const notifications = read("src/lib/account-notifications.server.ts");
const leadFunctions = read("src/lib/lead.functions.ts");
const whatsappLeadFunctions = read("src/lib/whatsapp-lead.functions.ts");
const voiceStatusRoute = read("src/routes/api/public/voice/therapist-status.ts");

describe("unified support mailbox", () => {
  it("keeps therapist support history compact and separate from lead notifications", () => {
    expect(settingsRoute).toContain('title="יצירת קשר עם הצוות"');
    expect(settingsRoute).toContain('title="פניות אחרונות לצוות"');
    expect(settingsRoute).toContain("requests.slice(0, 5)");
    expect(settingsRoute).not.toContain('title="התראות"');
    expect(settingsRoute).not.toContain("notify_new_leads");
    expect(settingsRoute).not.toContain("staff_response");
    expect(credentialsRoute).toContain("עדכוני אימות באימייל");
    expect(credentialsRoute).toContain("notify_account_updates");
  });

  it("removes the redundant new-lead account email flow", () => {
    expect(notifications).not.toContain("sendNewLeadAccountNotification");
    expect(leadFunctions).not.toContain("sendNewLeadAccountNotification");
    expect(whatsappLeadFunctions).not.toContain("sendNewLeadAccountNotification");
    expect(voiceStatusRoute).not.toContain("sendNewLeadAccountNotification");
  });

  it("stores external email conversations server-side and caps owner history at ten", () => {
    expect(migration).toContain("create table if not exists public.account_support_messages");
    expect(migration).toContain("alter column account_id drop not null");
    expect(migration).toContain("source in ('site', 'email')");
    expect(migration).toContain("limit 10");
    expect(migration).toContain("account_support_messages_zoho_message_uidx");
    expect(migration).toContain("grant all on table public.account_support_messages to service_role");
  });

  it("syncs Zoho mail and sends replies only from admin-only server functions", () => {
    expect(adminFunctions).toContain("syncAdminSupportMailbox");
    expect(adminFunctions).toContain("replyAdminSupportRequest");
    expect(adminFunctions).toContain("requireTipulinksAdmin");
    expect(adminFunctions).toContain('import("./zoho-mail.server")');
    expect(adminRoute).toContain("סנכרון עכשיו");
    expect(adminRoute).toContain("admin@tipulinks.co.il");
    expect(adminRoute).toContain("SupportConversation");
  });

  it("uses stable ticket markers to reconnect site requests with email replies", () => {
    expect(supportTicketSubject("בעיה בחשבון", "ABCDEF1234")).toBe("Re: בעיה בחשבון [TL-ABCDEF1234]");
    expect(extractSupportTicketCode("Re: בעיה [TL-abcdef1234]")).toBe("ABCDEF1234");
    expect(extractSupportTicketCode("נושא רגיל")).toBeNull();
  });

  it("converts Zoho HTML content to safe readable plain text", () => {
    expect(htmlEmailToText("<div>שלום<br>עולם &amp; תודה</div>")).toBe("שלום\nעולם & תודה");
    expect(htmlEmailToText("<script>alert(1)</script><p>טקסט</p>")).toBe("טקסט");
  });
});
