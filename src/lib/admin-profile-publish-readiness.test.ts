import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const editorSource = readFileSync(join(import.meta.dir, "..", "routes", "_authenticated", "new-profile.tsx"), "utf8");
const profileFunctions = readFileSync(join(import.meta.dir, "therapist-profile.functions.ts"), "utf8");
const stage3Migration = readFileSync(
  join(import.meta.dir, "..", "..", "supabase", "migrations", "20260822090000_claim_invite_delivery.sql"),
  "utf8",
);
const domainRequirementMigration = readFileSync(
  join(import.meta.dir, "..", "..", "supabase", "migrations", "20260826090000_profile_publish_domain_requirement.sql"),
  "utf8",
);

describe("admin-created profile publish readiness", () => {
  it("requires a professional email in the admin editor before publish", () => {
    expect(editorSource).toContain('isAdmin && !form.email.trim() ? ["אימייל מקצועי"] : []');
    expect(editorSource).toContain('<Field label="אימייל מקצועי *">');
    expect(editorSource).toContain("זהו שדה חובה לפרסום");
    expect(editorSource).toContain("looksLikeEmailAddress(adminEmailValue)");
    expect(editorSource).toContain('type="email"');
    expect(editorSource).toContain("aria-invalid={!adminEmailOk}");
  });

  it("keeps the live readiness badge aligned with the publish button", () => {
    expect(editorSource).toContain('const displayStatus: "draft" | "completed" | "published" | "frozen"');
    expect(editorSource).toContain('profile.data?.visibility === "visible"');
    expect(editorSource).toContain("<StatusBadge status={displayStatus} />");
    expect(editorSource).toContain("allowPublishing={isAdmin}");
    expect(editorSource).toContain("{allowPublishing && (");
    expect(editorSource).toContain("disabled={pendingAction !== null || publishMissing}");
    expect(editorSource).toContain("!hasRecognizedTreatmentDomain");
  });

  it("enforces the professional email again at the server boundary for admin-public profiles", () => {
    expect(profileFunctions).toContain("OptionalContactEmailSchema");
    expect(profileFunctions).toContain("looksLikeEmailAddress(value)");
    expect(profileFunctions).toContain("function validateForPublish(");
    expect(profileFunctions).toContain('saveMode: "self" | "admin_public_info" = "self"');
    expect(profileFunctions).toContain('saveMode === "admin_public_info" && !input.email?.trim()');
    expect(profileFunctions).toContain('missing.push("אימייל מקצועי")');
    expect(profileFunctions).toContain("validateForPublish(data, semanticProfile, saveMode)");
  });

  it("requires a canonical treatment domain and makes years of experience optional at the server boundary", () => {
    const validationStart = profileFunctions.indexOf("function validateForPublish(");
    const validationEnd = profileFunctions.indexOf("async function resolvePhysicalLocations", validationStart);
    const validationSource = profileFunctions.slice(validationStart, validationEnd);

    expect(validationSource).toContain("semanticProfile.length === 0");
    expect(validationSource).toContain('תחום טיפול אחד לפחות מתוך "קצת עליי"');
    expect(validationSource).not.toContain("DESCRIPTION_MIN");
    expect(validationSource).not.toContain('missing.push("שנות ניסיון")');
  });

  it("enforces the professional email as a database invariant for future published rows", () => {
    expect(stage3Migration).toContain("therapists_admin_public_published_email_required");
    expect(stage3Migration).toContain("nullif(pg_catalog.btrim(email), '') IS NOT NULL");
    expect(stage3Migration).toContain(") NOT VALID;");
  });

  it("enforces the treatment-domain rule in the final database publication flow", () => {
    expect(domainRequirementMigration).toContain("therapists_published_semantic_profile_required");
    expect(domainRequirementMigration).toContain("profile_status = 'draft'");
    expect(domainRequirementMigration).toContain("visibility = 'hidden'");
    expect(domainRequirementMigration).toContain("profile_row.semantic_profile = '[]'::jsonb");
    expect(domainRequirementMigration).not.toContain("profile_row.years_experience is null");
    expect(domainRequirementMigration).not.toMatch(/full_description[\s\S]{0,80}< 60/);
  });
});
