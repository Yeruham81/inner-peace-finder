import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260822090000_claim_invite_delivery.sql");
const leadSource = read("src/lib/lead.functions.ts");
const inviteServer = read("src/lib/profile-claim-v2.server.ts");
const claimFunctions = read("src/lib/profile-claim-v2.functions.ts");
const claimRoute = read("src/routes/_authenticated/claim.tsx");
const searchEligibility = read("src/lib/search-eligibility.ts");
const leadModal = read("src/components/lead-modal.tsx");

describe("profile claim stage 3", () => {
  it("turns the committed first held lead into a Brevo ownership invitation", () => {
    expect(leadSource).toContain('row.delivery_channel === "consent_hold"');
    expect(leadSource).toContain("sendInitialClaimInvitationForLead");
    expect(inviteServer).toContain("https://api.brevo.com/v3/smtp/email");
    expect(inviteServer).toContain('inviteSource: "first_lead"');
    expect(migration).toContain("first-lead invite requires the held lead");
    expect(migration).toContain("source_lead_id uuid REFERENCES public.lead_events(id)");
  });

  it("never includes held-lead PII in the invitation payload", () => {
    expect(inviteServer).not.toContain("visitorName");
    expect(inviteServer).not.toContain("visitorPhone");
    expect(inviteServer).not.toContain("visitor_name");
    expect(inviteServer).not.toContain("visitor_phone");
    expect(inviteServer).toContain("יש לך פנייה ממשתמש/ת שראה את הפרופיל שלך באתר טיפולינקס");
    expect(inviteServer).toContain("נעים להכיר — טיפולינקס היא פלטפורמה");
    expect(inviteServer).toContain("פניות ממוקדות מאנשים שמעוניינים לתאם טיפול");
    expect(inviteServer).toContain("forTherapistsUrl: `${origin}/for-therapists`");
    expect(inviteServer).toContain("for_therapists_url: invite.forTherapistsUrl");
    expect(inviteServer).toContain("כדי להשלים את התהליך עליך לאמת את כתובת האימייל");
    expect(inviteServer).toContain("הקישור הינו אישי, תקף לזמן מוגבל");
    expect(inviteServer).not.toContain("פרטי הפונה אינם נכללים באימייל");
    expect(inviteServer).toContain("ולבקש להסיר אותו");
  });

  it("keeps the saved lead successful even when invitation delivery fails", () => {
    expect(leadSource).toContain("The transaction has committed");
    expect(leadSource).toContain("provider failure must");
    expect(leadSource).toContain("ok: true as const");
    expect(leadSource).toContain("billable: false");
    expect(inviteServer).toContain("mark_therapist_claim_invite_failed");
  });

  it("requires a delivered token and a confirmed matching auth email", () => {
    expect(migration).toContain("u.email_confirmed_at");
    expect(migration).toContain("account email is not verified");
    expect(migration).toContain("inv.delivery_status <> 'sent'");
    expect(migration).toContain("signed-in email does not match invite");
    expect(claimFunctions).toContain("data.user?.email_confirmed_at");
  });

  it("transfers ownership without rewriting origin or granting professional verification", () => {
    const claimRpc = migration.slice(
      migration.indexOf("CREATE FUNCTION public.claim_therapist_by_invite"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.approve_therapist_profile_removal"),
    );
    expect(claimRpc).toContain("SET owner_account_id = acc.id");
    expect(claimRpc).toContain("ownership_verification_method = 'professional_email_invite'");
    expect(claimRpc).not.toMatch(/SET[\s\S]*profile_origin\s*=/);
    expect(claimRpc).not.toContain("verified = true");
    expect(claimRpc).not.toContain("manual_verified = true");
  });

  it("blocks direct phone and WhatsApp disclosure until ownership is accepted", () => {
    const directContact = read("src/lib/contact-actions.functions.ts");
    const contactActions = read("src/components/cta-call-button.tsx");
    // No contact endpoint releases a therapist number to the browser any more.
    expect(directContact).toContain('reason: "method_unavailable"');
    expect(directContact).not.toContain("supabaseAdmin");
    // The WhatsApp channel is brokered server-side and refuses unclaimed
    // admin-created profiles inside the transactional submission RPC.
    const migrationsDir = resolve(root, "supabase/migrations");
    const whatsappMigration = readdirSync(migrationsDir)
      .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
      .find((sql) => sql.includes("function public.submit_whatsapp_lead"))!;
    expect(whatsappMigration).toContain("v_therapist.owner_account_id is null");
    expect(whatsappMigration).toContain("v_therapist.do_not_republish");
    expect(whatsappMigration).toContain("'therapist_unavailable'");
    expect(contactActions).toContain('props.unclaimedProfile\n    ? ["email"]');
  });

  it("makes Claim primary and keeps no-login removal secondary", () => {
    const notice = read("src/components/unclaimed-profile-notice.tsx");
    expect(notice).toContain('useState<ProfileRequestType>("claim_profile")');
    expect(notice).toContain("אינך מעוניין/ת שהפרופיל יופיע באתר? בקשת הסרה");
    expect(notice).toContain("אין צורך להירשם");
    expect(notice).not.toContain("grid-cols-2");
  });

  it("keeps ownership transfer separate from post-claim lead delivery", () => {
    expect(claimFunctions).toContain("Ownership transfer has already committed");
    expect(claimFunctions).toContain("HELD_LEAD_RELEASE_WINDOW_HOURS = 72");
    expect(claimFunctions).toContain('delivery_status: "expired_before_consent"');
  });

  it("retires the legacy self-service claim path and exposes real admin operations", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.therapist_claim_requests FROM authenticated");
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.approve_therapist_claim");
    expect(existsSync(resolve(root, "src/lib/therapist-claims.functions.ts"))).toBe(false);
    const adminRoute = read("src/routes/admin/claims.tsx");
    expect(adminRoute).toContain("listAdminClaims");
    expect(adminRoute).toContain("resendAdminClaimInvite");
    expect(adminRoute).not.toContain("mockClaims");
  });

  it("preserves the invitation destination across email signup confirmation", () => {
    const auth = read("src/routes/auth.tsx");
    expect(auth).toContain("emailRedirectTo");
    expect(auth).toContain("encodeURIComponent(dest)");
  });

  it("lets a mismatched Google user sign out and explicitly choose another account", () => {
    expect(claimRoute).toContain('supabase.auth.signOut({ scope: "local" })');
    expect(claimRoute).toContain("queryClient.clear()");
    expect(claimRoute).toContain('extraParams: { prompt: "select_account" }');
    expect(claimRoute).toContain("/claim?token=${encodeURIComponent(token)}");
    expect(claimRoute).toContain("התנתקות ובחירת חשבון Google אחר");
    expect(claimRoute).toContain("preview.emailMatchesSignedInUser && (");
  });

  it("removes an admin-created profile from all public reads after its first held lead", () => {
    expect(searchEligibility).toContain("first_contact_reserved_at.is.null");
    expect(searchEligibility).toContain("first_contact_sent_at.is.null");
    expect(searchEligibility).toContain("owner_reviewed_at.not.is.null");
    expect(searchEligibility).toContain("do_not_republish.eq.false");
    expect(leadModal).toContain('queryKey: ["unified-search"]');
    expect(leadModal).toContain('queryKey: ["structured-search"]');
    expect(leadModal).toContain('queryKey: ["filter-options"]');
  });
});
