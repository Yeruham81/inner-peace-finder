import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(projectRoot, ...parts), "utf8");

const migration = read("supabase/migrations/20260824210000_account_management_workflows.sql");
const leadSummaryFunctions = read("src/lib/account-activity.functions.ts");
const leadDetailFunctions = read("src/lib/account-lead-detail.functions.ts");
const leadsRoute = read("src/routes/_authenticated/account.leads.tsx");
const credentialFunctions = read("src/lib/admin-credentials.functions.ts");
const credentialRoute = read("src/routes/admin/credentials.tsx");
const supportFunctions = read("src/lib/admin-support.functions.ts");
const supportRoute = read("src/routes/admin/support.tsx");
const accountSupportFunctions = read("src/lib/account-support.functions.ts");
const settingsRoute = read("src/routes/_authenticated/account.settings.tsx");
const notifications = read("src/lib/account-notifications.server.ts");
const leadFunctions = read("src/lib/lead.functions.ts");
const voiceStatusRoute = read("src/routes/api/public/voice/therapist-status.ts");

describe("therapist account management workflows", () => {
  it("keeps the lead list non-PII and reveals details through owner-scoped RPCs only", () => {
    expect(leadSummaryFunctions).not.toContain("visitor_name");
    expect(leadSummaryFunctions).not.toContain("visitor_phone");
    expect(leadSummaryFunctions).not.toContain("private_note");
    expect(leadDetailFunctions).toContain("requireSupabaseAuth");
    expect(leadDetailFunctions).toContain('rpc("get_my_account_lead_detail"');
    expect(leadDetailFunctions).toContain('rpc("update_my_account_lead"');
    expect(migration).toContain("where account.auth_user_id = auth.uid()");
    expect(migration).toContain("and lead.therapist_id = v_therapist_id");
    expect(migration).toContain("revoke all on function public.get_my_account_lead_detail(uuid) from public, anon");
  });

  it("connects the therapist lead drawer to real details and a private workflow", () => {
    expect(leadsRoute).toContain("getMyAccountLeadDetail");
    expect(leadsRoute).toContain("updateMyAccountLead");
    expect(leadsRoute).toContain("WorkflowBadge");
    expect(leadsRoute).toContain("הערה פרטית");
    expect(leadsRoute).toContain("ההערה מוצגת רק בחשבון שלך");
    expect(leadsRoute).toContain("אינם נשמרים בחשבון");
  });

  it("uses admin-only credential review, short-lived document links and pending-only updates", () => {
    expect(credentialFunctions.match(/requireTipulinksAdmin/g)?.length).toBe(4);
    expect(credentialFunctions).toContain("createSignedUrl(credential.document_url, 5 * 60)");
    expect(credentialFunctions).toContain('current.verification_status !== "pending_review"');
    expect(credentialFunctions).toContain('.eq("verification_status", "pending_review")');
    expect(credentialFunctions).toContain("if (approved && !current.document_url)");
    expect(credentialFunctions).toContain("cleanupVerifiedCredentialDocument");
    expect(credentialFunctions).toContain('row.verification_status === "verified" && Boolean(row.document_url)');
    expect(credentialFunctions).toContain('credential?.verification_status === "verified"');
    expect(credentialFunctions).toContain('.from("therapist-credentials")');
    expect(credentialFunctions).toContain(".remove([documentPath])");
    expect(credentialFunctions).toContain(".update({ document_url: null })");
    expect(credentialFunctions).toContain("reviewed_by: context.userId");
    expect(credentialFunctions).toContain("sendCredentialStatusNotification");
    expect(credentialRoute).toContain("listAdminCredentials");
    expect(credentialRoute).not.toContain("mockCredentials");
  });

  it("connects staff support to owner history and the unified Zoho mailbox workflow", () => {
    expect(accountSupportFunctions).toContain("getMySupportRequests");
    expect(accountSupportFunctions).toContain("requireSupabaseAuth");
    expect(settingsRoute).toContain("getMySupportRequests");
    expect(settingsRoute).toContain("פניות אחרונות לצוות");
    expect(supportFunctions).toContain("requireTipulinksAdmin");
    expect(supportFunctions).toContain("syncAdminSupportMailbox");
    expect(supportFunctions).toContain("replyAdminSupportRequest");
    expect(supportRoute).toContain("listAdminSupportRequests");
    expect(supportRoute).toContain("SupportConversation");
    expect(migration).toContain("where account.auth_user_id = auth.uid()");
    expect(migration).toContain("revoke all on function public.get_my_support_requests() from public, anon");
  });

  it("keeps only credential status account notifications in active application code", () => {
    expect(migration).toContain("account.notify_account_updates");
    expect(migration).toContain("unique (account_id, notification_kind, entity_key)");
    expect(migration).toContain("grant all on table public.account_notification_deliveries to service_role");
    expect(notifications).toContain('kind: "credential_status"');
    expect(notifications).not.toContain("sendNewLeadAccountNotification");
    expect(notifications).not.toContain("sendSupportStatusNotification");
    expect(notifications).toContain("notificationKey: string");
    expect(leadFunctions).not.toContain("sendNewLeadAccountNotification");
    expect(voiceStatusRoute).not.toContain("sendNewLeadAccountNotification");
    expect(settingsRoute).not.toContain("notify_new_leads");
  });
});
