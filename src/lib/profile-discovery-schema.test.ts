import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260810120000_profile_discovery_and_credentials.sql"),
  "utf8",
);

describe("profile discovery schema", () => {
  it("is transactional and seeds every canonical therapy format", () => {
    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;\s*$/);
    for (const slug of [
      "individual",
      "couples",
      "family",
      "parent_child",
      "group",
      "parent_guidance",
    ]) {
      expect(sql).toContain(`('${slug}'`);
    }
  });

  it("keeps therapist-owned relation tables private and owner scoped", () => {
    for (const table of [
      "therapist_therapy_formats",
      "therapist_professional_memberships",
      "therapist_service_arrangements",
    ]) {
      expect(sql).toContain(`public.${table}`);
    }
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.therapist_therapy_formats FROM anon");
    expect(sql).toContain("a.auth_user_id = auth.uid()");
  });

  it("stores accessibility per location and only supports known features", () => {
    expect(sql).toContain("ALTER TABLE public.therapist_locations");
    expect(sql).toContain("accessibility_status");
    expect(sql).toContain("accessibility_features");
    expect(sql).toContain("accessibility_note");
    expect(sql).toContain("step_free_entrance");
    expect(sql).toContain("hearing_loop");
  });

  it("creates a private credential bucket and never grants owners verification columns", () => {
    expect(sql).toContain("'therapist-credentials', 'therapist-credentials', false");
    const ownerUpdateGrant = sql.slice(
      sql.indexOf("GRANT UPDATE ("),
      sql.indexOf(") ON public.therapist_credentials", sql.indexOf("GRANT UPDATE (")),
    );
    expect(ownerUpdateGrant).not.toContain("verification_status");
    expect(ownerUpdateGrant).not.toContain("verified_by");
    expect(ownerUpdateGrant).not.toContain("verified_at");
  });
});
