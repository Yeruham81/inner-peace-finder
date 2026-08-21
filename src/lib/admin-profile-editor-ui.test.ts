import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const editorSource = readFileSync(join(import.meta.dir, "..", "routes", "_authenticated", "new-profile.tsx"), "utf8");
const accountProfileSource = readFileSync(
  join(import.meta.dir, "..", "routes", "_authenticated", "account.profile.tsx"),
  "utf8",
);
const imageMigration = readFileSync(
  join(ROOT, "supabase/migrations/20260821193000_admin_public_profile_image_access.sql"),
  "utf8",
);

describe("admin profile editor mode", () => {
  it("derives admin mode from the authenticated server actor instead of a browser flag", () => {
    expect(editorSource).toContain("getProfileEditorActorMode");
    expect(editorSource).toContain('actorMode.data?.is_admin === true');
    expect(editorSource).not.toContain('tipulinks1@gmail.com');
  });

  it("uses the dedicated admin save/load functions and an explicit therapist id", () => {
    expect(editorSource).toContain("getAdminManagedProfile");
    expect(editorSource).toContain("saveAdminManagedProfile");
    expect(editorSource).toContain("therapist_id: activeAdminTherapistId");
    expect(editorSource).toContain('["admin-managed-profile", activeAdminTherapistId ?? "new"]');
  });

  it("persists the newly-created therapist id into the route so refresh edits the same profile", () => {
    expect(editorSource).toContain("onAdminTherapistIdChange?.(res.therapist_id)");
    expect(editorSource).toContain('search: { therapistId: nextTherapistId }');
    expect(accountProfileSource).toContain('search: { therapistId: nextTherapistId }');
  });

  it("never copies the admin login email into a therapist profile", () => {
    expect(editorSource).toContain('const editorDefaultEmail = isAdmin ? "" : defaultEmail');
    expect(editorSource).toContain("כתובת האימייל של חשבון האדמין אינה מועתקת לפרופיל");
  });

  it("keeps credential verification as a therapist-owned action", () => {
    expect(editorSource).toContain("אימות הסמכות מקצועיות יתבצע על ידי המטפל/ת לאחר לקיחת הבעלות");
    expect(editorSource).toContain("isAdmin ? (");
  });

  it("allows admin image writes only for unclaimed admin-public profiles", () => {
    expect(imageMigration).toContain("auth.jwt() -> 'app_metadata' ->> 'tipulinks_role'");
    expect(imageMigration).toContain("t.profile_origin = 'admin_public_info'");
    expect(imageMigration).toContain("t.owner_account_id IS NULL");
    expect(imageMigration).toContain("t.do_not_republish = false");
  });
});
