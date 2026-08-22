import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260820070000_profile_claim_v2.sql");
const hardeningMigration = read("supabase/migrations/20260820173000_profile_claim_v2_hardening_fix.sql");

describe("profile claim v2", () => {
  it("marks admin-created public profiles explicitly without changing self-created defaults", () => {
    expect(migration).toContain("profile_origin text NOT NULL DEFAULT 'self_created'");
    expect(migration).toContain("'admin_public_info'");
    expect(migration).toContain("mark_therapist_as_admin_public_profile");
  });

  it("keeps public ownership/removal requests service-role only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.therapist_profile_requests");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.therapist_profile_requests FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("GRANT ALL ON TABLE public.therapist_profile_requests TO service_role");
  });

  it("never treats the email supplied in a public request as identity proof", () => {
    expect(migration).toContain("invite email must match the pre-existing profile email");
    expect(migration).toContain("signed-in email does not match invite");
  });

  it("stores only a hash of the claim token", () => {
    expect(migration).toContain("token_hash text NOT NULL UNIQUE");
    const claimFunctions = read("src/lib/profile-claim-v2.functions.ts");
    const claimServer = read("src/lib/profile-claim-v2.server.ts");
    expect(claimFunctions).toContain('crypto.subtle.digest("SHA-256"');
    expect(claimServer).toContain('crypto.subtle.digest("SHA-256"');
    expect(claimFunctions).not.toContain("createHash(");
    expect(claimServer).not.toContain("createHash(");
    expect(read("src/lib/profile-claim-v2.server.ts")).toContain("randomBytes(32)");
  });

  it("enforces one global initial contact for an unclaimed profile", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("first_contact_reserved_at IS NOT NULL");
    expect(migration).toContain("first_contact_sent_at IS NOT NULL");
    expect(migration).toContain("'unclaimed_contact_limit'");
    expect(hardeningMigration).toContain("'consent_hold'");
    expect(hardeningMigration).toContain("RETURN QUERY SELECT true, 'accepted'");
    expect(migration).toContain("mark_therapist_claim_invite_sent");
    expect(hardeningMigration).toContain("'awaiting_consent'");
  });

  it("keeps the initial unclaimed inquiry non-billable and undispatched until claim", () => {
    expect(hardeningMigration).toContain(
      "NOT (v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL)",
    );
    const lead = read("src/lib/lead.functions.ts");
    expect(lead).toContain('row.delivery_channel === "consent_hold"');
    expect(lead).toContain("are NOT");
    expect(lead).toContain("billable: false");
  });

  it("records explicit participation consent and releases only a fresh held inquiry after acceptance", () => {
    expect(migration).toContain("participation_consent_at=pg_catalog.now()");
    expect(migration).toContain("participation_consent_source='claim_invite'");
    expect(read("src/routes/_authenticated/claim.tsx")).toContain("קבלת בעלות וניהול הפרופיל");
    const source = read("src/lib/profile-claim-v2.functions.ts");
    expect(source).toContain("HELD_LEAD_RELEASE_WINDOW_HOURS = 72");
    expect(source).toContain('.eq("delivery_status", "awaiting_consent")');
    expect(source).toContain('delivery_status: "expired_before_consent"');
    expect(source).toContain('dispatchLead("email"');
  });

  it("marks an admin-created profile reviewed inside the transactional save RPC", () => {
    expect(hardeningMigration).toContain("CREATE OR REPLACE FUNCTION public.save_therapist_profile_with_contacts");
    expect(hardeningMigration).toContain("owner_reviewed_at = CASE");
    expect(hardeningMigration).toContain("SET search_path = ''");
    expect(read("src/lib/therapist-profile.functions.ts")).not.toContain(".update({ owner_reviewed_at:");
  });

  it("shows the required disclosure on public unclaimed profiles", () => {
    const notice = read("src/components/unclaimed-profile-notice.tsx");
    expect(notice).toContain("פרופיל זה נוצר על בסיס מידע פומבי וטרם עודכן על ידי המטפל/ת");
    expect(notice).toContain("זה הפרופיל שלך? צרו איתנו קשר");
  });

  it("removes the legacy search-based claim UI", () => {
    const route = read("src/routes/_authenticated/claim.tsx");
    expect(route).toContain("קבלת בעלות על הפרופיל");
    expect(route).not.toContain("חיפוש פרופיל");
    expect(route).not.toContain("license_number");
  });

  it("suppresses approved removal requests from future republishing", () => {
    expect(migration).toContain("do_not_republish=true");
    expect(migration).toContain("visibility='hidden_by_owner'");
    expect(migration).toContain("is_active=false");
  });
});
