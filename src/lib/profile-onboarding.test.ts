import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildProfileOnboardingStatus,
  deriveCredentialOnboardingState,
  hasConfiguredContact,
} from "./profile-onboarding";

const completeProfile = {
  slug: "profile-one",
  profile_status: "published" as const,
  is_active: true,
  visibility: "visible",
  profile_origin: "self_created",
  billing_hold: false,
  email: "clinic@example.test",
  phone: null,
  contact_methods: ["email"],
  preferred_contact_method: "email",
};

describe("profile onboarding state", () => {
  it("treats a submitted document as complete before administrator approval", () => {
    expect(
      deriveCredentialOnboardingState(
        [{ verification_status: "pending_review", document_url: "private/document.pdf" }],
        null,
      ),
    ).toBe("submitted");
  });

  it("keeps the public-verification distinction and reopens rejected submissions", () => {
    expect(deriveCredentialOnboardingState([{ verification_status: "verified" }], null)).toBe("verified");
    expect(deriveCredentialOnboardingState([{ verification_status: "rejected" }], null)).toBe("action_required");
    expect(deriveCredentialOnboardingState([{ verification_status: "rejected" }], "2026-08-23T00:00:00Z")).toBe(
      "action_required",
    );
  });

  it("allows an explicit skip only when no submitted credential needs action", () => {
    expect(deriveCredentialOnboardingState([], "2026-08-23T00:00:00Z")).toBe("skipped");
    expect(deriveCredentialOnboardingState([], null)).toBe("not_started");
  });

  it("requires a destination for every selected contact channel", () => {
    expect(hasConfiguredContact(completeProfile)).toBe(true);
    expect(
      hasConfiguredContact({
        ...completeProfile,
        phone: null,
        contact_methods: ["whatsapp"],
        preferred_contact_method: "whatsapp",
      }),
    ).toBe(false);
  });

  it("completes all five steps only with an active payment method", () => {
    const active = buildProfileOnboardingStatus({
      accountStatus: "active",
      credentialVerificationSkippedAt: null,
      paymentMethodStatus: "active",
      profile: completeProfile,
      credentials: [{ verification_status: "pending_review", document_url: "private/document.pdf" }],
    });
    expect(active.completedCount).toBe(5);
    expect(active.allStepsComplete).toBe(true);
    expect(active.isPublic).toBe(true);
    expect(active.isPublished).toBe(true);
    expect(active.isActive).toBe(true);
    expect(active.visibility).toBe("visible");

    const notConfigured = buildProfileOnboardingStatus({
      accountStatus: "active",
      credentialVerificationSkippedAt: null,
      paymentMethodStatus: "not_configured",
      profile: completeProfile,
      credentials: [{ verification_status: "pending_review", document_url: "private/document.pdf" }],
    });
    expect(notConfigured.completedCount).toBe(4);
    expect(notConfigured.steps.payment).toBe("action_required");
    expect(notConfigured.isBillingPaused).toBe(true);
  });

  it("opens the payment step and marks a billing-paused profile as non-public", () => {
    const status = buildProfileOnboardingStatus({
      accountStatus: "active",
      credentialVerificationSkippedAt: "2026-08-23T00:00:00Z",
      paymentMethodStatus: "expired",
      profile: { ...completeProfile, billing_hold: true, is_active: false },
      credentials: [],
    });
    expect(status.steps.payment).toBe("action_required");
    expect(status.isBillingPaused).toBe(true);
    expect(status.isPublic).toBe(false);
    expect(status.isActive).toBe(false);
  });

  it("keeps a frozen published profile out of the green state when payment was never configured", () => {
    const status = buildProfileOnboardingStatus({
      accountStatus: "active",
      credentialVerificationSkippedAt: "2026-08-23T00:00:00Z",
      paymentMethodStatus: "not_configured",
      profile: { ...completeProfile, visibility: "hidden", is_active: false },
      credentials: [],
    });
    expect(status.steps.payment).toBe("action_required");
    expect(status.completedCount).toBe(4);
    expect(status.allStepsComplete).toBe(false);
    expect(status.isBillingPaused).toBe(true);
  });
});

describe("profile onboarding migration", () => {
  const migration = readFileSync(
    join(import.meta.dir, "../../supabase/migrations/20260823090000_profile_onboarding_status.sql"),
    "utf8",
  );

  it("stores the skip decision without granting direct account updates", () => {
    expect(migration).toContain("credential_verification_skipped_at");
    expect(migration).toContain("set_my_credential_verification_skip");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.set_my_credential_verification_skip(boolean) TO authenticated",
    );
  });

  it("pauses and resumes billing without changing profile_status or visibility", () => {
    expect(migration).toContain("is_active_before_billing_hold");
    expect(migration).toContain("trg_sync_account_payment_hold");
    expect(migration).not.toMatch(/SET\s+profile_status\s*=/i);
    expect(migration).not.toMatch(/SET\s+visibility\s*=/i);
  });
});

describe("completed profile publication controls", () => {
  const publicationMigration = readFileSync(
    join(import.meta.dir, "../../supabase/migrations/20260826090000_profile_publish_domain_requirement.sql"),
    "utf8",
  );
  const onboardingCard = readFileSync(
    join(import.meta.dir, "../components/account/profile-onboarding-card.tsx"),
    "utf8",
  );
  const overview = readFileSync(join(import.meta.dir, "../routes/_authenticated/account.index.tsx"), "utf8");
  const editor = readFileSync(join(import.meta.dir, "../routes/_authenticated/new-profile.tsx"), "utf8");

  it("rechecks every onboarding requirement at the database boundary before publishing", () => {
    expect(publicationMigration).toContain("auth.uid()");
    expect(publicationMigration).toContain("account_row.payment_method_status <> 'active'");
    expect(publicationMigration).toContain("credential_verification_skipped_at is not null");
    expect(publicationMigration).toContain("credential.verification_status in ('rejected', 'expired')");
    expect(publicationMigration).toContain("credential.verification_status in ('pending_review', 'verified')");
    expect(publicationMigration).toContain("profile_row.profile_status <> 'completed'");
    expect(publicationMigration).toContain("profile_row.semantic_profile = '[]'::jsonb");
    expect(publicationMigration).not.toContain("profile_row.years_experience is null");
    expect(publicationMigration).not.toMatch(/full_description[\s\S]{0,80}< 60/);
    expect(publicationMigration).toContain("from public.therapist_professions");
    expect(publicationMigration).toContain("from public.therapist_languages");
    expect(publicationMigration).toContain("from public.therapist_populations");
    expect(publicationMigration).toContain("profile_row.preferred_contact_method = any");
    expect(publicationMigration).toContain("profile_status = 'published'");
    expect(publicationMigration).toContain(
      "grant execute on function public.publish_my_completed_profile() to authenticated",
    );
  });

  it("uses a compact green management panel and reopens the steps only for billing repair", () => {
    expect(onboardingCard).toContain(
      "const compact = !billingNeedsAction && (status.allStepsComplete || status.isPublished)",
    );
    expect(onboardingCard).toContain("כל חמשת השלבים הושלמו");
    expect(onboardingCard).toContain("bg-emerald-50/85");
    expect(onboardingCard).toContain('<X className="h-4 w-4" />');
    expect(onboardingCard).toContain("פרסום הפרופיל");
    expect(onboardingCard).toContain("הקפאת הפרופיל");
    expect(onboardingCard).toContain("הפעלת הפרופיל מחדש");
    expect(onboardingCard).toContain("פתיחת הפרופיל");
    expect(onboardingCard).toContain("const displayedSteps = paymentRepairOnly");
    expect(onboardingCard).toContain('step.id === "payment" ? 5 : index + 1');
    expect(onboardingCard).toContain("ארבעת השלבים הראשונים כבר הושלמו");
  });

  it("keeps public-state actions in overview while the therapist editor only saves and previews", () => {
    expect(overview).toContain("publishMyProfile");
    expect(overview).toContain("setMyProfileVisibility");
    expect(editor).toContain("שמירת הפרופיל");
    expect(editor).toContain("תצוגה מקדימה");
    expect(editor).toContain("חזרה למסך הסקירה");
    expect(editor).not.toContain("setMyProfileVisibility");
  });
});
