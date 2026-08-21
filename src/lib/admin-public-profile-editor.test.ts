import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const migration = readFileSync(
  join(ROOT, "supabase/migrations/20260821170000_admin_public_profile_editor.sql"),
  "utf8",
);
const profileFunctions = readFileSync(join(import.meta.dir, "therapist-profile.functions.ts"), "utf8");

describe("admin-created therapist profile ownership", () => {
  it("keeps the normal self-service save as the default mode", () => {
    expect(migration).toContain("v_save_mode text := coalesce(nullif(_payload ->> 'save_mode', ''), 'self')");
    expect(profileFunctions).toContain('saveMode: "self"');
  });

  it("requires an admin claim at both the server and database boundary", () => {
    expect(profileFunctions).toContain('tipulinks_role === "admin"');
    expect(profileFunctions).toContain("אין הרשאת מנהל ליצירת פרופיל מטעם Tipulinks");
    expect(migration).toContain("raw_app_meta_data ->> 'tipulinks_role'");
    expect(migration).toContain("RAISE EXCEPTION 'admin role required'");
  });

  it("creates admin-public profiles without assigning ownership", () => {
    expect(migration).toContain("CASE WHEN v_save_mode = 'self' THEN v_account_id ELSE NULL END");
    expect(migration).toContain("v_save_mode = 'self'");
    expect(migration).toContain("CASE WHEN v_save_mode = 'self' THEN 'self_created' ELSE 'admin_public_info' END");
  });

  it("only allows admin editing of an explicit unclaimed admin-public target", () => {
    expect(migration).toContain("id = v_target_therapist_id");
    expect(migration).toContain("profile_origin = 'admin_public_info'");
    expect(migration).toContain("owner_account_id IS NULL");
    expect(migration).toContain("do_not_republish = false");
    expect(profileFunctions).toContain("target_therapist_id: saveMode === \"admin_public_info\" ? targetTherapistId : null");
  });

  it("does not mark an unclaimed admin-created profile as owner reviewed", () => {
    expect(migration).toContain(
      "WHEN profile_origin = 'admin_public_info' AND owner_account_id IS NOT NULL AND owner_reviewed_at IS NULL",
    );
  });
});
