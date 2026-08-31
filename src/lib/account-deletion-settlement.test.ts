import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

const migration = read("supabase/migrations/20260831113500_account_deletion_settlement_flow.sql");
const deletionServer = read("src/lib/account-deletion.server.ts");
const profileManagement = read("src/lib/profile-management.server.ts");
const profileFunctions = read("src/lib/therapist-profile.functions.ts");
const settings = read("src/routes/_authenticated/account.settings.tsx");

describe("account deletion settlement flow", () => {
  it("freezes the account and profile before evaluating deletion", () => {
    const freezeAccount = migration.indexOf("set account_status = 'suspended'");
    const freezeProfile = migration.indexOf("set visibility = 'hidden'::public.therapist_visibility");
    const balanceCheck = migration.indexOf("v_outstanding := public.account_outstanding_balance_agorot");

    expect(freezeAccount).toBeGreaterThan(-1);
    expect(freezeProfile).toBeGreaterThan(-1);
    expect(balanceCheck).toBeGreaterThan(freezeAccount);
    expect(balanceCheck).toBeGreaterThan(freezeProfile);
    expect(migration).toContain("trg_reject_new_reservation_for_suspended_account");
    expect(migration).toContain("raise exception 'account_not_eligible'");
  });

  it("does not discard an in-flight billable lead just to complete deletion", () => {
    expect(migration).toContain("expires_at <> 'infinity'::timestamptz");
    expect(migration).toContain("and expires_at <= pg_catalog.now()");
    expect(migration).toContain("v_status := 'blocked_pending_leads'");
    expect(migration).not.toContain(
      "set status = 'released', released_at = pg_catalog.now()\n  where account_id = v_account.id\n    and status = 'reserved';",
    );
    expect(settings).toContain("מחיקת החשבון אינה אפשרית כרגע.");
    expect(settings).toContain("admin@tipulinks.co.il");
    expect(settings).toContain("mailto:${supportEmail}");
  });

  it("requires every accrued charge to be settled before final deletion", () => {
    expect(migration).toContain("create or replace function public.account_outstanding_balance_agorot");
    expect(migration).toContain("pg_catalog.sum(usage.spent_agorot)");
    expect(migration).toContain("payment.status = 'succeeded'");
    expect(migration).toContain("create or replace function public.assert_account_deletion_ready");
    expect(migration).toContain("raise exception 'account_deletion_balance_due:%', v_outstanding");
    expect(profileManagement).toContain("await assertOwnedAccountDeletionReady(authUserId)");
  });

  it("uses a separate explicit confirmation for the immediate saved-method charge", () => {
    expect(profileFunctions).toContain("settleAndDeleteMyAccountPermanently");
    expect(settings).toContain("קיימת יתרה שטרם חויבה");
    expect(settings).toContain("באישור הפעולה יתבצע חיוב מיידי באמצעי התשלום השמור");
    expect(settings).toContain("אישור חיוב ${formatDeletionBalance(balance)} ומחיקת החשבון");
    expect(settings).toContain("מחייב ומוחק את החשבון…");
  });

  it("keeps failed payments frozen and never fabricates a real provider success", () => {
    expect(deletionServer).toContain('if (input.paymentMethodKind === "test")');
    expect(deletionServer).toContain('throw new Error("real_payment_provider_not_configured")');
    expect(deletionServer).toContain("החשבון והפרופיל נשארו מוקפאים");
    expect(migration).toContain("when _success then 'succeeded' else 'failed'");
    expect(migration).toContain("else 'payment_failed'");
    expect(profileManagement).toContain('.update({ account_status: "suspended" })');
  });

  it("preserves minimal successful payment records after the Auth account is deleted", () => {
    expect(migration).toContain("account_id uuid references public.therapist_accounts(id) on delete set null");
    expect(migration).toContain("account_reference uuid not null");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("revoke all on table public.billing_payment_attempts from public, anon, authenticated");
  });
});
