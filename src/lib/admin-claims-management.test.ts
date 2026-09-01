import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const route = read("src/routes/admin/claims.tsx");
const functions = read("src/lib/admin-claims.functions.ts");
const migration = read("supabase/migrations/20260831160000_admin_claims_management_view.sql");
const dataTable = read("src/components/admin/admin-data-table.tsx");
const therapistsRoute = read("src/routes/admin/therapists.tsx");

describe("admin claims management", () => {
  it("keeps the normalized claims feed private and service-role only", () => {
    expect(migration).toContain("CREATE VIEW public.admin_profile_claims");
    expect(migration).toContain("WITH (security_invoker = true)");
    expect(migration).toContain("REVOKE ALL ON TABLE public.admin_profile_claims FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.admin_profile_claims TO service_role");
  });

  it("enforces server-side admin authorization for reads and mutations", () => {
    expect(functions).toContain(".middleware([requireSupabaseAuth])");
    expect(functions).toContain("requireTipulinksAdmin(context.claims");
    expect(functions).not.toContain("MOCK_CLAIMS");
  });

  it("supports real server-side search, filtering, sorting, counting and pagination", () => {
    expect(functions).toContain('.from("admin_profile_claims")');
    expect(functions).toContain('{ count: "exact" }');
    expect(functions).toContain('.ilike("search_text"');
    expect(functions).toContain('.eq("verification_category"');
    expect(functions).toContain("SORT_COLUMNS");
    expect(functions).toContain(".range(from, to)");
    expect(functions).toContain("pageCount: Math.max(1, Math.ceil(total / data.pageSize))");
  });

  it("approves ownership only by sending the canonical professional-email invitation", () => {
    const approval = functions.slice(
      functions.indexOf("export const approveAdminClaimRequest"),
      functions.indexOf("const SendInviteSchema"),
    );
    expect(approval).toContain("sendClaimInvitation");
    expect(approval).toContain('inviteSource: "profile_request"');
    expect(approval).not.toContain("owner_account_id");
    expect(approval).not.toContain("profile_claimed");
    expect(route).toContain("אישור ושליחת הזמנה");
    expect(route).toContain("הבעלות לא תועבר עד שההזמנה תתקבל");
  });

  it("prepares ownership-verification display without implementing phone ownership verification", () => {
    expect(route).toContain("דרך אימות הבעלות");
    expect(route).toContain('email: "אימייל"');
    expect(route).toContain('phone: "טלפון"');
    expect(route).toContain('unverified: "טרם אומת"');
    expect(functions).not.toContain("Twilio Verify");
    expect(functions).not.toContain("otp");
    expect(migration).not.toContain("verification_code");
  });

  it("provides sortable columns, column visibility and controlled pagination", () => {
    expect(route).toContain("בחירת עמודות");
    expect(route).toContain("DropdownMenuCheckboxItem");
    expect(route).toContain("CLAIM_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]");
    expect(route).toContain("sortDirection");
    expect(dataTable).toContain("AdminControlledPagination");
    expect(dataTable).toContain("aria-current");
    expect(dataTable).toContain("דפדוף בין עמודי הטבלה");
  });

  it("shows operational details and links directly to the matching admin therapist", () => {
    expect(route).toContain("זמן המתנה");
    expect(route).toContain("אימייל מבקש/ת");
    expect(route).toContain('to="/admin/therapists"');
    expect(route).toContain("therapistId: selected.therapistId");
    expect(therapistsRoute).toContain("validateSearch: zodValidator(z.object({ therapistId: z.string().uuid().optional() }))");
    expect(therapistsRoute).toContain("routeSearch.therapistId");
  });

  it("keeps concurrent review and ownership audit states consistent", () => {
    expect(functions).toContain('.update({ reviewed_by: context.userId })');
    expect(functions).toContain('.is("reviewed_by", null)');
    expect(functions).toContain("Keep reviewed_by set for both a newly-sent invite and a pre-existing");
    expect(route).toContain('result.invitationStatus === "already_pending"');
    expect(migration).toContain("therapist_profile_requests_one_claim_verification_idx");
    expect(migration).toContain("AND reviewed_by IS NOT NULL");
    expect(migration).toContain("SET status = 'cancelled'");
    expect(route).toContain('request_verification_pending: "ממתין לאימות"');
  });

  it("requires a rejection reason and prevents finalized requests from using review actions", () => {
    expect(functions).toContain("reason: z.string().trim().min(3).max(1000)");
    expect(functions).toContain('.eq("status", "pending")');
    expect(route).toContain('selected?.status === "request_pending" || selected?.status === "request_verification_pending"');
    expect(route).toContain("reason.trim().length < 3");
  });
});
