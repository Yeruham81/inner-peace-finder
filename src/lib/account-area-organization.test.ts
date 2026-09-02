import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(import.meta.dir, "..", ...parts), "utf8");
const navSource = read("components", "account", "account-nav.ts");
const leadsSource = read("routes", "_authenticated", "account.leads.tsx");
const settingsSource = read("routes", "_authenticated", "account.settings.tsx");
const onboardingSource = read("components", "account", "profile-onboarding-card.tsx");
const editorSource = read("routes", "_authenticated", "new-profile.tsx");
const supportMigrationSource = read("..", "supabase", "migrations", "20260823103000_account_support_requests.sql");
const notificationMigrationSource = read(
  "..",
  "supabase",
  "migrations",
  "20260823103500_account_notification_preferences.sql",
);

describe("therapist account area organization", () => {
  it("orders the sidebar according to the therapist workflow", () => {
    const labels = ["סקירה", "הפרופיל שלי", "אימות הסמכות", "פניות", "חיובים", "הגדרות"];
    labels.reduce((previousIndex, label) => {
      const nextIndex = navSource.indexOf(`label: "${label}"`);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      return nextIndex;
    }, -1);
    expect(navSource).not.toContain('label: "אימות והסמכות"');
  });

  it("owns contact preferences in the leads screen and links there from profile flows", () => {
    expect(leadsSource).toContain("<ContactPreferencesPanel");
    expect(settingsSource).not.toContain("updateMyContactPreferences");
    expect(onboardingSource).toContain('to="/account/leads"');
    expect(editorSource).toContain('to="/account/leads"');
  });

  it("keeps settings focused on account, security, display, support and deletion", () => {
    expect(settingsSource).toContain("supabase.auth.updateUser({ email:");
    expect(settingsSource).toContain("supabase.auth.updateUser({ password }");
    expect(settingsSource).toContain("supabase.auth.signInWithPassword");
    expect(settingsSource).toContain("hasPasswordLogin ?");
    expect(settingsSource).toContain("סיסמה נוכחית");
    expect(settingsSource).toContain("הסיסמה מנוהלת אצל ספק ההתחברות");
    expect(settingsSource).toContain("saveDisplayPreferences");
    expect(settingsSource).toContain("submitMySupportRequest");
    expect(settingsSource).toContain("DeleteAccountPanel");
  });

  it("keeps the legacy notification columns while removing the redundant new-lead UI", () => {
    expect(notificationMigrationSource).toContain("notify_new_leads boolean");
    expect(notificationMigrationSource).toContain("notify_account_updates boolean");
    expect(settingsSource).not.toContain("notify_new_leads");
  });

  it("persists support requests through an authenticated database function", () => {
    expect(supportMigrationSource).toContain("create table if not exists public.account_support_requests");
    expect(supportMigrationSource).toContain("security definer");
    expect(supportMigrationSource).toContain("auth.uid()");
    expect(supportMigrationSource).toContain("grant execute");
  });
});
