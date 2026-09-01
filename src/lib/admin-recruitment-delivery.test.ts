import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  normalizeRecruitmentBrevoEvent,
  recruitmentTokenHash,
  RECRUITMENT_EMAIL_DAILY_LIMIT,
  RECRUITMENT_INVITE_ATTRIBUTE,
} from "./recruitment-delivery.server";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260901131500_therapist_recruitment_delivery.sql");
const ambiguityFixMigration = read("supabase/migrations/20260901131600_fix_recruitment_invitation_id_ambiguity.sql");
const adminFunctions = read("src/lib/admin-recruitment.functions.ts");
const route = read("src/routes/admin/recruitment.tsx");
const auth = read("src/routes/auth.tsx");
const webhook = read("src/routes/api/public/email/recruitment-status.ts");
const inviteFunctions = read("src/lib/recruitment-invite.functions.ts");
const delivery = read("src/lib/recruitment-delivery.server.ts");
const recruitmentTemplate = read("docs/brevo/therapist-recruitment-template.html");

describe("therapist recruitment delivery", () => {
  it("uses a 100-per-day database-enforced reservation boundary", () => {
    expect(RECRUITMENT_EMAIL_DAILY_LIMIT).toBe(100);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_used + v_requested_count > 100");
    expect(migration).toContain("AT TIME ZONE 'Asia/Jerusalem'");
    expect(adminFunctions).toContain("reserveRecruitmentEmailInvitations");
  });

  it("qualifies recruitment invitation ids inside the PL/pgSQL reserve function", () => {
    expect(ambiguityFixMigration).toContain("count(DISTINCT requested.invitation_id)");
    expect(ambiguityFixMigration).toContain("count(DISTINCT requested.token_hash)");
    expect(ambiguityFixMigration).not.toContain("count(DISTINCT invitation_id)");
  });

  it("only allows retries after a definite pre-acceptance failure", () => {
    expect(migration).toContain("status IN ('ready', 'submission_failed')");
    expect(migration).toContain("send_quota_date = NULL");
    expect(migration).toContain("'submission_unknown'");
    expect(route).toContain("מצב שליחה לא ידוע");
  });

  it("stores only a SHA-256 hash of a high-entropy invitation token locally", async () => {
    expect(await recruitmentTokenHash("example-secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(delivery).toContain('randomBytes(32).toString("base64url")');
    expect(migration).toContain("invite_token_hash text");
    expect(migration).not.toContain("invite_token text");
  });

  it("keeps invitation token hashing in a client-safe neutral helper", () => {
    expect(inviteFunctions).toContain('from "./recruitment-token"');
    expect(inviteFunctions).not.toContain('from "./recruitment-delivery.server"');
  });

  it("renders the Hebrew recruitment template explicitly right-to-left", () => {
    expect(recruitmentTemplate).toContain('<html lang="he" dir="rtl">');
    expect(recruitmentTemplate).toContain('<body dir="rtl"');
    expect(recruitmentTemplate).toContain("direction:rtl;text-align:right");
    expect(recruitmentTemplate).toContain('style="text-align:center;margin:30px 0;"');
  });

  it("opens valid recruitment invites on signup and preserves the invite through Google OAuth", () => {
    expect(auth).toContain('invite ? "signup" : (mode ?? "signin")');
    expect(auth).toContain("if (!recruitmentInviteValid) return;");
    expect(auth).toContain('provider: "google"');
    expect(auth).toContain("options: { redirectTo: redirectUrl }");
    expect(auth).toContain("...(invite ? { invite } : {})");
    expect(auth).toContain("mode: oauthMode");
  });
  it("uses a Brevo marketing campaign template and personalized invitation URL attribute", () => {
    expect(RECRUITMENT_INVITE_ATTRIBUTE).toBe("TIPULINKS_INVITE_URL");
    expect(delivery).toContain("BREVO_RECRUITMENT_TEMPLATE_ID");
    expect(delivery).toContain("/emailCampaigns");
    expect(delivery).toContain("/sendNow");
    expect(delivery).toContain("recipients: { listIds: [input.listId] }");
  });

  it("uses a recruitment-only sender instead of the shared system-message sender", () => {
    const campaignBody = delivery.slice(
      delivery.indexOf("async function createBrevoCampaign"),
      delivery.indexOf("async function deleteBrevoDraftCampaign"),
    );
    expect(campaignBody).toContain("BREVO_RECRUITMENT_FROM_ADDRESS");
    expect(campaignBody).toContain("BREVO_RECRUITMENT_FROM_ADDRESS_not_configured");
    expect(campaignBody).not.toContain("EMAIL_FROM_ADDRESS");
    expect(campaignBody).not.toContain("notifications@tipulinks.co.il");
    expect(campaignBody).not.toContain("messages@tipulinks.co.il");
  });

  it("lets authoritative provider events resolve an earlier unknown or contradictory send outcome", () => {
    expect(migration).toContain("'submission_unknown') THEN 'delivered'");
    expect(migration).toContain("'submission_unknown') THEN 'bounced'");
  });

  it("normalizes delivery, bounce and unsubscribe webhook names", () => {
    expect(normalizeRecruitmentBrevoEvent("hardBounce")).toBe("hard_bounce");
    expect(normalizeRecruitmentBrevoEvent("softBounce")).toBe("soft_bounce");
    expect(normalizeRecruitmentBrevoEvent("soft_bounced")).toBe("soft_bounce");
    expect(normalizeRecruitmentBrevoEvent("hard_bounced")).toBe("hard_bounce");
    expect(normalizeRecruitmentBrevoEvent("unsubscribed")).toBe("unsubscribed");
    expect(webhook).toContain("verifyBrevoWebhookAuthorization(request)");
    expect(webhook).toContain("applyRecruitmentBrevoWebhook");
  });

  it("records unsubscribe as recruitment-only suppression without blocking transactional email", () => {
    expect(migration).toContain("public.therapist_recruitment_suppressions");
    expect(migration).toContain("'recipient_opt_out'");
    const eventFn = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_recruitment_email_event"),
    );
    expect(eventFn).not.toContain("INSERT INTO public.contact_email_suppressions");
  });

  it("allows a valid invite to create an account while global registration is closed only after verified email match", () => {
    expect(migration).toContain("auth_user.email_confirmed_at");
    expect(migration).toContain("v_invitation.destination_normalized <> v_email");
    expect(migration).toContain("INSERT INTO public.therapist_accounts (auth_user_id)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.claim_recruitment_invite(text) TO authenticated");
    expect(auth).toContain("registrationEnabled || recruitmentInviteValid");
    expect(auth).toContain("completeRecruitmentInviteRegistration");
    expect(inviteFunctions).toContain('context.supabase.rpc("claim_recruitment_invite"');
  });

  it("tracks temporary Brevo recipient lists and cleans old lists without deleting contacts", () => {
    const deliverBody = delivery.slice(delivery.indexOf("export async function deliverRecruitmentEmailBatch"));
    expect(deliverBody.indexOf('rpc("attach_recruitment_email_provider_list"')).toBeGreaterThan(-1);
    expect(deliverBody.indexOf('rpc("attach_recruitment_email_provider_list"')).toBeLessThan(
      deliverBody.indexOf("campaignId = await createBrevoCampaign"),
    );
    expect(delivery).toContain("cleanupOldBrevoRecruitmentLists");
    expect(delivery).toContain("/contacts/lists/${listId}");
    expect(migration).toContain("provider_list_deleted_at");
    expect(migration).toContain("mark_recruitment_provider_list_deleted");
  });

  it("persists campaign correlation before sendNow so early webhooks can be applied", () => {
    const deliverBody = delivery.slice(delivery.indexOf("export async function deliverRecruitmentEmailBatch"));
    expect(deliverBody.indexOf('rpc("attach_recruitment_email_provider_batch"')).toBeGreaterThan(-1);
    expect(deliverBody.indexOf('rpc("attach_recruitment_email_provider_batch"')).toBeLessThan(
      deliverBody.indexOf("const result = await sendBrevoCampaignNow"),
    );
    expect(migration).toContain("provider_campaign_id = _provider_campaign_id");
    expect(migration).toContain(
      "status = CASE WHEN status IN ('submitting', 'submitted', 'submission_failed', 'submission_unknown') THEN 'delivered' ELSE status END",
    );
  });
});
