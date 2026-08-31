import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const migration = read("supabase/migrations/20260831095000_profile_contact_bypass_monitoring.sql");
const profileServer = read("src/lib/therapist-profile.functions.ts");
const editor = read("src/routes/_authenticated/new-profile.tsx");
const adminServer = read("src/lib/admin-therapists.functions.ts");
const adminPage = read("src/routes/admin/therapists.tsx");

describe("therapist profile direct-contact policy integration", () => {
  it("records one server-side event per blocked save without storing the attempted text", () => {
    expect(profileServer).toContain('rpc("record_profile_contact_policy_violation"');
    expect(profileServer).toContain("throw new Error(CONTACT_POLICY_SAVE_ERROR)");
    expect(migration).toContain("contact_policy_violation_count = contact_policy_violation_count + 1");
    expect(migration).toContain("therapist_contact_policy_events");
    expect(migration).toContain("violation_types text[]");
    expect(migration).toContain("field_names text[]");
    expect(migration).not.toMatch(/attempted_text|raw_text|contact_value|detected_value/i);
  });

  it("keeps the audit table private and the recorder service-role only", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.therapist_contact_policy_events FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_profile_contact_policy_violation(uuid, uuid, text[], text[]) TO service_role",
    );
  });

  it("shows warnings only in the three narrative fields and leaves the save attempt to the server so it can be counted", () => {
    expect(editor).toContain("scanProfileContactPolicy(form)");
    expect(editor).toContain('contactPolicyTypesFor("full_description")');
    expect(editor).toContain('contactPolicyTypesFor("education_training")');
    expect(editor).toContain('contactPolicyTypesFor("professional_experience")');
    expect(editor).not.toContain('contactPolicyTypesFor("full_name")');
    expect(editor).not.toContain('contactPolicyTypesFor("professional_title")');
    expect(editor).not.toContain('contactPolicyTypesFor("short_intro")');
    expect(editor).not.toContain("contactPolicyTypesFor(`locations.${index}.address`)");
    expect(editor).not.toContain("contactPolicyScan.findings.length > 0 &&");
    expect(editor).not.toContain("if (contactPolicyScan.findings.length > 0) return");
  });

  it("enforces and records the policy for therapist self-service saves, not admin-managed edits", () => {
    expect(profileServer).toContain('saveMode === "self" ? scanProfileContactPolicy(data) : null');
    expect(profileServer).toContain('rpc("record_profile_contact_policy_violation"');
  });

  it("surfaces the accumulated count and last violation in the therapists admin screen", () => {
    expect(adminServer).toContain("contact_policy_violation_count");
    expect(adminServer).toContain("contactPolicyLastViolationAt");
    expect(adminPage).toContain("ניסיונות עקיפת קשר");
    expect(adminPage).toContain("ניטור עקיפת קשר");
  });
});
