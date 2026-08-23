import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const foundation = read("supabase/migrations/20260823120000_monthly_budget_foundation.sql");
const enforcement = read("supabase/migrations/20260823121000_monthly_budget_enforcement.sql");
const billingPage = read("src/routes/_authenticated/account.billing.tsx");
const searchEligibility = read("src/lib/search-eligibility.ts");
const budgetFunctions = read("src/lib/billing-budget.functions.ts");
const budgetServer = read("src/lib/billing-budget.server.ts");

describe("monthly advertising budget foundation", () => {
  it("keeps pricing inactive until a positive lead price is deliberately configured", () => {
    expect(foundation).toContain("lead_price_agorot bigint");
    expect(foundation).toContain("pricing_active boolean not null default false");
    expect(foundation).toContain("check (not pricing_active or lead_price_agorot is not null)");
  });

  it("uses Israeli calendar-month boundaries and an automatically expiring profile hold", () => {
    expect(foundation).toContain("timezone('Asia/Jerusalem'");
    expect(foundation).toContain("billing_next_month_at");
    expect(foundation).toContain("budget_hold_until");
    expect(searchEligibility).toContain("budget_hold_until.is.null,budget_hold_until.lte.");
  });

  it("keeps budget, usage, reservations and the notification outbox private", () => {
    for (const table of [
      "therapist_monthly_budgets",
      "therapist_monthly_budget_usage",
      "monthly_budget_reservations",
      "monthly_budget_notifications",
    ]) {
      expect(foundation).toContain(`alter table public.${table} force row level security`);
      expect(foundation).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      );
    }
  });

  it("allows an administrator-only test marker without storing any card data", () => {
    expect(foundation).toContain("payment_method_kind in ('none', 'real', 'test')");
    expect(foundation).toContain("auth.jwt() -> 'app_metadata' ->> 'tipulinks_role'");
    expect(foundation).toContain("admin_required");
    expect(foundation).not.toMatch(/card_number|pan_number|cvv|expiry_month|expiry_year/i);
    expect(billingPage).toContain("אמצעי תשלום לבדיקה");
    expect(billingPage).toContain('user.app_metadata?.tipulinks_role === "admin"');
    expect(budgetFunctions).toContain('rpc("set_my_test_payment_method"');
  });
});

describe("monthly advertising budget enforcement", () => {
  it("blocks a new billable event when the remaining budget cannot cover its price", () => {
    expect(enforcement).toContain("v_limit - v_spent - v_reserved < v_price");
    expect(enforcement).toContain("monthly_budget_exhausted");
    expect(enforcement).toContain("trg_enforce_cta_monthly_budget");
  });

  it("is idempotent and serializes concurrent charges per therapist account", () => {
    expect(enforcement).toContain("pg_advisory_xact_lock");
    expect(foundation).toContain("unique (account_id, source_type, source_key)");
    expect(enforcement).toContain("already_exists");
  });

  it("reserves voice-call capacity and releases it when the call is not answered", () => {
    expect(enforcement).toContain("reserve_monthly_budget_for_voice");
    expect(enforcement).toContain("commit_monthly_budget_reservation");
    expect(enforcement).toContain("release_unused_voice_monthly_budget");
    expect(enforcement).toContain("new.outcome <> 'answered'");
  });

  it("queues one notification per account and month and sends a billing-page link", () => {
    expect(foundation).toContain("unique (account_id, month_start)");
    expect(enforcement).toContain("claim_monthly_budget_notification");
    expect(enforcement).toContain("finish_monthly_budget_notification");
    expect(budgetServer).toContain("https://api.brevo.com/v3/smtp/email");
    expect(budgetServer).toContain("/account/billing");
  });

  it("exposes budget editing now while explaining that enforcement awaits pricing", () => {
    expect(billingPage).toContain("תקציב פרסום חודשי");
    expect(billingPage).toContain("שמירת התקציב");
    expect(billingPage).toContain("מחיר לפנייה");
    expect(billingPage).toContain("האכיפה תתחיל רק לאחר שמחיר הפנייה יוגדר");
    expect(budgetFunctions).toContain('rpc("set_my_monthly_budget"');
  });
});
