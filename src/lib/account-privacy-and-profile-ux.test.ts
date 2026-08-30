import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultTherapistAvatar } from "./therapist-default-avatar";

const root = join(import.meta.dir, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const sidebarSource = read("src", "components", "account", "account-sidebar.tsx");
const editorSource = read("src", "routes", "_authenticated", "new-profile.tsx");
const overviewSource = read("src", "routes", "_authenticated", "account.index.tsx");
const onboardingCardSource = read("src", "components", "account", "profile-onboarding-card.tsx");
const settingsSource = read("src", "routes", "_authenticated", "account.settings.tsx");
const leadsSource = read("src", "routes", "_authenticated", "account.leads.tsx");
const managementSource = read("src", "lib", "profile-management.server.ts");
const profileFunctionsSource = read("src", "lib", "therapist-profile.functions.ts");
const claimDeliverySource = read("src", "lib", "profile-claim-v2.server.ts");
const publicContractSource = read("src", "lib", "public-therapist-profile.ts");
const migrationSource = read("supabase", "migrations", "20260822130000_account_privacy_and_suppression.sql");

describe("account/profile UX follow-up", () => {
  it("hides the redundant edit-profile shortcut while the editor is already open", () => {
    expect(sidebarSource).toContain('const isProfileEditor = pathname === "/account/profile"');
    expect(sidebarSource).toContain("{!isProfileEditor && (");
  });

  it("shows frozen as a distinct status and preserves reactivation controls", () => {
    expect(editorSource).toContain('"published" | "frozen"');
    expect(editorSource).toContain('frozen: { l: "מוקפא"');
    expect(editorSource).toContain('const isPublished = status === "published" || status === "frozen"');
    expect(editorSource).not.toContain("setMyProfileVisibility");
    expect(overviewSource).toContain("setMyProfileVisibility");
    expect(onboardingCardSource).toContain("הפעלת הפרופיל מחדש");
    expect(onboardingCardSource).toContain("הקפאת הפרופיל");
  });

  it("keeps the first-save missing-fields feedback across the new admin profile identity transition", () => {
    expect(editorSource).toContain("const preserveNextIdentityTransition = useRef(false)");
    expect(editorSource).toContain("const preserveSaveFeedback = preserveNextIdentityTransition.current");
    expect(editorSource).toContain("if (!preserveSaveFeedback)");
    expect(editorSource).toContain("preserveNextIdentityTransition.current = true");
  });

  it("protects unsaved profile edits across internal navigation and browser unloads", () => {
    expect(editorSource).toContain("useBlocker");
    expect(editorSource).toContain("shouldBlockFn: () => hasUnsavedChangesRef.current");
    expect(editorSource).toContain("enableBeforeUnload: () => hasUnsavedChangesRef.current");
    expect(editorSource).toContain("יש שינויים שלא נשמרו");
    expect(editorSource).toContain("שמירה והמשך");
    expect(editorSource).toContain("יציאה ללא שמירה");
    expect(editorSource).toContain("navigationBlocker.reset()");
    expect(editorSource).toContain("navigationBlocker.proceed()");
  });

  it("keeps profile deletion in the editor and account deletion in settings", () => {
    expect(editorSource).toContain("<DeleteProfilePanel");
    expect(settingsSource).toContain("<DeleteAccountPanel");
    expect(settingsSource).toContain('confirmation: "מחיקת החשבון לצמיתות"');
    expect(profileFunctionsSource).toContain("export const deleteMyAccountPermanently");
  });

  it("updates the login email independently of the professional contact email", () => {
    expect(settingsSource).toContain("supabase.auth.updateUser({ email: loginEmail.trim() })");
    expect(settingsSource).toContain("ואינו משנה את האימייל המקצועי לקבלת פניות");
    expect(settingsSource).not.toContain("contactPreferences.email");
    expect(leadsSource).toContain("<ContactPreferencesPanel");
  });
});

describe("account deletion and no-contact suppression", () => {
  it("stores only a protected minimal email registry", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.contact_email_suppressions");
    expect(migrationSource).toContain("email_normalized text PRIMARY KEY");
    expect(migrationSource).toContain(
      "REVOKE ALL ON TABLE public.contact_email_suppressions FROM PUBLIC, anon, authenticated",
    );
    const tableStart = migrationSource.indexOf("CREATE TABLE IF NOT EXISTS public.contact_email_suppressions");
    const tableEnd = migrationSource.indexOf("\n);", tableStart);
    const tableDefinition = migrationSource.slice(tableStart, tableEnd);
    expect(tableDefinition).not.toMatch(/\b(full_name|phone|profile_content|account_id|therapist_id)\b/);
  });

  it("records opt-outs atomically and blocks future admin profiles and claim invitations", () => {
    expect(migrationSource).toContain("PERFORM public.record_contact_email_suppressions");
    expect(migrationSource).toContain("trg_enforce_admin_profile_email_suppression");
    expect(migrationSource).toContain("trg_enforce_claim_invite_email_suppression");
    expect(profileFunctionsSource).toContain('saveMode === "admin_public_info"');
    expect(profileFunctionsSource).toContain('"is_contact_email_suppressed"');
    expect(claimDeliverySource).toContain('"is_contact_email_suppressed"');
  });

  it("records suppression before deleting the profile and deletes the auth user last", () => {
    const deleteProfile = managementSource.indexOf("await permanentlyDeleteOwnedProfile(authUserId)");
    const recordSuppression = managementSource.indexOf('supabaseAdmin.rpc("record_contact_email_suppressions"');
    const deleteAuthUser = managementSource.indexOf("supabaseAdmin.auth.admin.deleteUser(authUserId)");

    expect(deleteProfile).toBeGreaterThan(-1);
    expect(recordSuppression).toBeGreaterThan(-1);
    expect(deleteProfile).toBeGreaterThan(recordSuppression);
    expect(deleteAuthUser).toBeGreaterThan(deleteProfile);
  });
});

describe("gender-aware default illustrations", () => {
  it("chooses gendered local assets and keeps unspecified profiles neutral", () => {
    expect(defaultTherapistAvatar("male")).toBe("/images/default-therapist-male.svg");
    expect(defaultTherapistAvatar("female")).toBe("/images/default-therapist-female.svg");
    expect(defaultTherapistAvatar("unspecified")).toBeNull();
    expect(defaultTherapistAvatar(null)).toBeNull();
  });

  it("includes gender in the explicit public projection needed to render the fallback", () => {
    expect(publicContractSource).toContain('"gender"');
    const privateStart = publicContractSource.indexOf("export const PRIVATE_THERAPIST_COLUMNS");
    const privateEnd = publicContractSource.indexOf("] as const", privateStart);
    expect(publicContractSource.slice(privateStart, privateEnd)).not.toContain('"gender"');
  });
});
