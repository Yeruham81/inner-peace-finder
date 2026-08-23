import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(projectRoot, ...parts), "utf8");

const migration = read("supabase/migrations/20260823223000_account_activity_data.sql");
const functions = read("src/lib/account-activity.functions.ts");
const overview = read("src/routes/_authenticated/account.index.tsx");
const leads = read("src/routes/_authenticated/account.leads.tsx");
const billing = read("src/routes/_authenticated/account.billing.tsx");
const analytics = read("src/lib/analytics.ts");
const profileRoute = read("src/routes/therapists.$slug.tsx");

describe("therapist account real data", () => {
  it("loads overview, leads and billing history through authenticated server functions", () => {
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain('rpc("get_my_account_dashboard"');
    expect(functions).toContain('rpc("get_my_account_leads"');
    expect(functions).toContain('rpc("get_my_billing_transactions"');
    expect(overview).toContain("getMyAccountDashboard");
    expect(leads).toContain("getMyAccountLeads");
    expect(billing).toContain("getMyBillingTransactions");
  });

  it("owner-scopes every private activity RPC and denies anonymous execution", () => {
    expect(migration.match(/where account\.auth_user_id = auth\.uid\(\)/g)?.length).toBe(3);
    expect(migration).toContain("get_my_account_dashboard() from public, anon");
    expect(migration).toContain("get_my_account_leads(integer) from public, anon");
    expect(migration).toContain("get_my_billing_transactions(integer) from public, anon");
    expect(migration).toContain(
      "grant execute on function public.get_my_account_dashboard() to authenticated",
    );
  });

  it("never returns lead message, visitor name or visitor phone to the account summary screens", () => {
    expect(migration).not.toContain("'visitor_name'");
    expect(migration).not.toContain("'visitor_phone'");
    expect(migration).not.toContain("'message'");
    expect(functions).not.toContain("visitor_name");
    expect(functions).not.toContain("visitor_phone");
  });

  it("tracks a real public profile-view event for the profile-view metric", () => {
    expect(analytics).toContain('| "therapist_profile_viewed"');
    expect(profileRoute).toContain('track("therapist_profile_viewed"');
    expect(migration).toContain("event.event_name = 'therapist_profile_viewed'");
  });

  it("keeps example data explicitly opt-in and clearly separate from account data", () => {
    expect(overview).toContain("הצגת דוגמה");
    expect(overview).toContain("להמחשה בלבד");
    expect(leads).toContain("אינם נשמרים בחשבון");
    expect(billing).toContain("התקציב ואמצעי התשלום המוצגים בעמוד נשארים הנתונים האמיתיים שלך");
  });
});
