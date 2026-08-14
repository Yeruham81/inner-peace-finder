import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../../supabase/migrations/20260814152000_sync_verified_credentials.sql"),
  "utf8",
);

describe("credential verification projection", () => {
  it("preserves pre-credential verification exactly once", () => {
    expect(sql).toContain("ADD COLUMN manual_verified boolean");
    expect(sql).toContain("UPDATE public.therapists SET manual_verified = verified");
    expect(sql).toContain("column_name = 'manual_verified'");
    expect(sql).toContain("ALTER COLUMN manual_verified SET NOT NULL");
  });

  it("projects a manual badge OR any verified credential", () => {
    expect(sql).toMatch(/manual_verified OR EXISTS/g);
    expect(sql).toContain("credential.verification_status = 'verified'");
    expect(sql).toContain("UPDATE public.therapists AS therapist");
  });

  it("synchronizes every credential transition and reassignment", () => {
    expect(sql).toContain("AFTER INSERT OR DELETE OR UPDATE OF verification_status, therapist_id");
    expect(sql).toContain("OLD.therapist_id IS DISTINCT FROM NEW.therapist_id");
    expect(sql).toContain("RETURN OLD");
    expect(sql).toContain("RETURN NEW");
  });

  it("prevents authenticated profile owners from self-verifying", () => {
    expect(sql).toContain("auth.role() = 'authenticated'");
    expect(sql).toContain("verification fields are administrator controlled");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF manual_verified, verified");
  });

  it("uses hardened definer functions that are not client callable", () => {
    expect(sql.match(/SECURITY DEFINER/g)?.length).toBe(2);
    expect(sql.match(/SET search_path = ''/g)?.length).toBe(2);
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;\s*$/);
  });
});
