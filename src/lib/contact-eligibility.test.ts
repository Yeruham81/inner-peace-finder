/**
 * Eligibility enforcement for every contact / lead path.
 *
 * These tests assert the canonical rule (is_active + profile_status=published +
 * visibility in visible|published) is applied by:
 *  - the shared TypeScript predicate,
 *  - `recordCtaClick` (no phone, no RPC, no billable event when ineligible),
 *  - `createLead` (no billing, no lead row, no dispatch when ineligible),
 *  - the hardened `record_cta_click` database function.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { isEligibleRow, THERAPIST_ELIGIBILITY } from "./search-eligibility";

const SRC = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function row(over: Record<string, unknown> = {}) {
  return { is_active: true, profile_status: "published", visibility: "visible", ...over };
}

describe("canonical eligibility predicate", () => {
  it("accepts active + published + visible", () => {
    expect(isEligibleRow(row())).toBe(true);
  });

  it("accepts the legacy `published` visibility", () => {
    expect(isEligibleRow(row({ visibility: "published" }))).toBe(true);
  });

  it("rejects draft profiles", () => {
    expect(isEligibleRow(row({ profile_status: "draft" }))).toBe(false);
  });

  it("rejects completed-but-unpublished profiles", () => {
    expect(isEligibleRow(row({ profile_status: "completed" }))).toBe(false);
  });

  it("rejects hidden profiles", () => {
    expect(isEligibleRow(row({ visibility: "hidden" }))).toBe(false);
  });

  it("rejects hidden_by_owner profiles", () => {
    expect(isEligibleRow(row({ visibility: "hidden_by_owner" }))).toBe(false);
  });

  it("rejects archived profiles", () => {
    expect(isEligibleRow(row({ visibility: "archived" }))).toBe(false);
  });

  it("rejects inactive profiles", () => {
    expect(isEligibleRow(row({ is_active: false }))).toBe(false);
  });

  it("exposes exactly the two publicly listed visibilities", () => {
    expect([...THERAPIST_ELIGIBILITY.visibilities].sort()).toEqual(["published", "visible"]);
    expect(THERAPIST_ELIGIBILITY.profileStatus).toBe("published");
    expect(THERAPIST_ELIGIBILITY.isActive).toBe(true);
  });

  it("the CTA path reuses the centralized predicate instead of re-declaring it", () => {
    const src = read("lib/therapists.functions.ts");
    expect(src.includes('from "./search-eligibility"')).toBe(true);
    expect(src.includes("applyEligibility(")).toBe(true);
    expect(src.includes('"visible", "published"')).toBe(false);
  });

  it("the lead path delegates eligibility to the atomic database transaction", () => {
    const src = read("lib/lead.functions.ts");
    // No application-side eligibility read: the RPC re-checks it in the same
    // transaction that consumes the challenge and creates the CTA + lead.
    expect(src.includes("applyEligibility(")).toBe(false);
    expect(src.includes('"visible", "published"')).toBe(false);
    expect(src.includes('.rpc("submit_lead"')).toBe(true);
  });
});

describe("recordCtaClick", () => {
  const src = read("lib/therapists.functions.ts");
  const cta = src.slice(src.indexOf("export const recordCtaClick"));

  it("queries only eligible therapists", () => {
    const gate = cta.indexOf("applyEligibility");
    expect(gate).toBeGreaterThan(-1);
    // eligibility gate precedes the phone read and the RPC call
    expect(gate).toBeLessThan(cta.indexOf('rpc("record_cta_click"'));
  });

  it("returns a generic unavailable result without a phone for ineligible or unknown ids", () => {
    const unavailable = cta.slice(cta.indexOf("if (!therapist)"), cta.indexOf('rpc("record_cta_click"'));
    expect(unavailable.includes('reason: "therapist_unavailable"')).toBe(true);
    expect(unavailable.includes("phone: null")).toBe(true);
    expect(unavailable.includes("billable: false")).toBe(true);
    expect(unavailable.includes("alreadyExists: false")).toBe(true);
    // no leak of profile state / existence
    for (const leak of ["draft", "hidden", "archived", "not found", "inactive"]) {
      expect(unavailable.toLowerCase().includes(leak)).toBe(false);
    }
  });

  it("never reaches the billing RPC when the therapist is ineligible", () => {
    // the early return happens before the RPC statement
    expect(cta.indexOf("return {\n        ok: false")).toBeLessThan(cta.indexOf('rpc("record_cta_click"'));
  });
});

describe("createLead", () => {
  const src = read("lib/lead.functions.ts");

  it("creates nothing before the transactional RPC has accepted the submission", () => {
    const rpc = src.indexOf('.rpc("submit_lead"');
    expect(rpc).toBeGreaterThan(-1);
    expect(src.indexOf('rpc("record_cta_click"')).toBe(-1);
    expect(src.indexOf('.from("lead_events")\n      .insert(')).toBe(-1);
    expect(rpc).toBeLessThan(src.indexOf("dispatchLead("));
  });

  it("returns the generic Hebrew response for missing or ineligible therapists", () => {
    const guard = src.slice(src.indexOf('if (reason === "rate_limit_exceeded")'), src.indexOf("dispatchLead("));
    expect(guard.includes('reason: "therapist_unavailable" as const')).toBe(true);
    expect(guard.includes("לא ניתן לשלוח פנייה לפרופיל זה כרגע.")).toBe(true);
  });

  it("no longer throws a distinguishable not-found error", () => {
    expect(src.includes('throw new Error("Therapist not found")')).toBe(false);
  });
});

describe("lead modal", () => {
  it("shows the generic message without exposing profile state", () => {
    const src = read("components/lead-modal.tsx");
    expect(src.includes('res.reason === "therapist_unavailable"')).toBe(true);
    expect(src.includes("לא ניתן לשלוח פנייה לפרופיל זה כרגע.")).toBe(true);
  });
});

describe("record_cta_click database function", () => {
  const dir = join(SRC, "..", "supabase", "migrations");
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .find((sql) => sql.includes("FUNCTION public.record_cta_click") && sql.includes("is_active = true"))!;

  it("contains the canonical eligibility guard before inserting a CTA event", () => {
    expect(file).toBeTruthy();
    const guard = file.slice(0, file.indexOf("INSERT INTO public.cta_clicks"));
    expect(guard.includes("t.is_active = true")).toBe(true);
    expect(guard.includes("t.profile_status = 'published'")).toBe(true);
    expect(guard.includes("t.visibility IN ('visible', 'published')")).toBe(true);
    expect(guard.includes("RETURN;")).toBe(true);
  });

  it("revokes execution from anon and authenticated and grants it to service_role only", () => {
    expect(/REVOKE ALL ON FUNCTION public\.record_cta_click[^;]*FROM PUBLIC;/.test(file)).toBe(true);
    expect(/REVOKE ALL ON FUNCTION public\.record_cta_click[^;]*FROM anon, authenticated;/.test(file)).toBe(true);
    expect(/GRANT EXECUTE ON FUNCTION public\.record_cta_click[^;]*TO service_role;/.test(file)).toBe(true);
    expect(/GRANT EXECUTE[^;]*record_cta_click[^;]*TO anon/.test(file)).toBe(false);
  });

  it("preserves SECURITY DEFINER, fixed search_path, signature and idempotency", () => {
    expect(file.includes("SECURITY DEFINER")).toBe(true);
    // Effective state: no privileged function relies on a mutable search path.
    expect(file.includes("SET search_path = ''")).toBe(true);
    expect(file.includes("SET search_path = 'public'")).toBe(false);
    expect(file.includes("ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING")).toBe(true);
    expect(file.includes("RETURNS TABLE(billable boolean, already_exists boolean, click_id uuid)")).toBe(true);
  });
});
