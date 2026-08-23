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
    expect(deriveCredentialOnboardingState([{ verification_status: "verified" }], null)).toBe(
      "verified",
    );
    expect(deriveCredentialOnboardingState([{ verification_status: "rejected" }], null)).toBe(
      "action_required",
    );
    expect(
      deriveCredentialOnboardingState(
        [{ verification_status: "rejected" }],
        "2026-08-23T00:00:00Z",
      ),
    ).toBe("action_required");
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
      credentials: [
        { verification_status: "pending_review", document_url: "private/document.pdf" },
      ],
    });
    expect(active.completedCount).toBe(5);
    expect(active.allStepsComplete).toBe(true);
    expect(active.isPublic).toBe(true);

    const notConfigured = buildProfileOnboardingStatus({
      accountStatus: "active",
      credentialVerificationSkippedAt: null,
      paymentMethodStatus: "not_configured",
      profile: completeProfile,
      credentials: [
        { verification_status: "pending_review", document_url: "private/document.pdf" },
      ],
    });
    expect(notConfigured.completedCount).toBe(4);
    expect(notConfigured.steps.payment).toBe("incomplete");
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
