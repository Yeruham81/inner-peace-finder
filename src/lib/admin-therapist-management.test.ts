import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { therapistSlugBase } from "./therapist-slug";

const adminFunctions = readFileSync("src/lib/admin-therapists.functions.ts", "utf8");
const adminRoute = readFileSync("src/routes/admin/therapists.tsx", "utf8");
const profileFunctions = readFileSync("src/lib/therapist-profile.functions.ts", "utf8");
const slugModule = readFileSync("src/lib/therapist-slug.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260822031500_admin_profile_management.sql", "utf8");

describe("admin therapist management", () => {
  it("loads real therapist rows instead of mock data", () => {
    expect(adminRoute).toContain("listAdminTherapists");
    expect(adminRoute).not.toContain("MOCK_THERAPISTS");
    expect(adminFunctions).toContain('.from("therapists")');
  });

  it("only offers admin editing and deletion for unclaimed Tipulinks-created profiles", () => {
    expect(adminRoute).toContain('row.profileOrigin === "admin_public_info"');
    expect(adminRoute).toContain("!row.ownerAccountId");
    expect(adminRoute).toContain("!row.profileClaimed");
    expect(adminRoute).toContain('to="/new-profile" search={{ therapistId: selected.id }}');
  });

  it("enforces admin-only deletion again in the database and locks Claim before storage cleanup", () => {
    expect(migration).toContain("raw_app_meta_data ->> 'tipulinks_role'");
    expect(migration).toContain("profile_origin = 'admin_public_info'");
    expect(migration).toContain("owner_account_id IS NULL");
    expect(migration).toContain("do_not_republish = true");
    expect(adminFunctions).toContain("begin_admin_public_profile_deletion");
    expect(adminFunctions).toContain("finalize_admin_public_profile_deletion");
  });
});

describe("clean therapist slugs", () => {
  it("uses a human-readable base and numeric collision suffixes without random text", () => {
    expect(slugModule).toContain("export function therapistSlugBase");
    expect(profileFunctions).toContain('import { therapistSlugBase } from "./therapist-slug"');
    expect(therapistSlugBase("שמשון שושני")).toBe("שמשון-שושני");
    expect(therapistSlugBase("  דנה   לוי  ")).toBe("דנה-לוי");
    expect(profileFunctions).not.toContain("Math.random()");
    expect(migration).toContain("assign_unique_therapist_slug");
    expect(migration).toContain("v_candidate := v_base || '-' || v_suffix::text");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("keeps the slug stable on profile updates", () => {
    const migrationEditor = readFileSync("supabase/migrations/20260821170000_admin_public_profile_editor.sql", "utf8");
    const updateBlock = migrationEditor.slice(
      migrationEditor.indexOf("UPDATE public.therapists SET"),
      migrationEditor.indexOf("DELETE FROM public.therapist_professions"),
    );
    expect(updateBlock).not.toContain("slug =");
  });
});
