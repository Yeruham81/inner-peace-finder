import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260810120000_profile_discovery_and_credentials.sql"),
  "utf8",
);
const dateFieldsSql = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260812150000_credential_issue_and_membership_start_dates.sql"),
  "utf8",
);
const credentialSyncSql = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260813120000_multiple_credentials_verification_sync.sql"),
  "utf8",
);

describe("profile discovery schema", () => {
  it("is transactional and seeds every canonical therapy format", () => {
    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;\s*$/);
    for (const slug of ["individual", "couples", "family", "parent_child", "group", "parent_guidance"]) {
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

describe("credential and membership dates", () => {
  it("adds real date fields without reinterpreting or dropping the legacy values", () => {
    expect(dateFieldsSql).toContain("ADD COLUMN IF NOT EXISTS issue_date date");
    expect(dateFieldsSql).toContain("ADD COLUMN IF NOT EXISTS membership_start_date date");
    expect(dateFieldsSql).not.toContain("DROP COLUMN");
    expect(dateFieldsSql).not.toMatch(/UPDATE[\s\S]+expires_at/i);
    expect(dateFieldsSql).not.toMatch(/UPDATE[\s\S]+member_since/i);
  });

  it("allows profile owners to submit the issue date without granting verification fields", () => {
    expect(dateFieldsSql).toContain("GRANT INSERT (issue_date) ON public.therapist_credentials TO authenticated");
    expect(dateFieldsSql).toContain("GRANT UPDATE (issue_date) ON public.therapist_credentials TO authenticated");
    expect(dateFieldsSql).not.toContain("GRANT UPDATE (verification_status)");
    expect(dateFieldsSql).not.toContain("GRANT UPDATE (verified_at)");
    expect(dateFieldsSql).not.toContain("GRANT UPDATE (verified_by)");
  });
});

describe("multiple credential verification sync", () => {
  it("is transactional and updates the public verified flag after credential decisions", () => {
    expect(credentialSyncSql).toMatch(/^BEGIN;/);
    expect(credentialSyncSql).toMatch(/COMMIT;\s*$/);
    expect(credentialSyncSql).toContain("sync_therapist_verified_from_credentials");
    expect(credentialSyncSql).toContain("AFTER INSERT OR DELETE OR UPDATE OF verification_status");
    expect(credentialSyncSql).toContain("SET verified = EXISTS");
    expect(credentialSyncSql).toContain("credential.verification_status = 'verified'");
  });

  it("uses a protected trigger function and preserves existing legacy verification flags", () => {
    expect(credentialSyncSql).toContain("SECURITY DEFINER");
    expect(credentialSyncSql).toContain(
      "REVOKE ALL ON FUNCTION public.sync_therapist_verified_from_credentials() FROM PUBLIC",
    );
    expect(credentialSyncSql).toContain("SET verified = true");
    expect(credentialSyncSql).not.toContain("SET verified = false");
    expect(credentialSyncSql).not.toContain("GRANT UPDATE (verification_status)");
  });
});
