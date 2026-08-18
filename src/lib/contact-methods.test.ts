import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(import.meta.dir, "..", "..", "supabase", "migrations", "20260818050500_contact_methods.sql"),
  "utf8",
);

describe("contact methods migration", () => {
  it("keeps contact availability separate from the legacy lead-delivery enum", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS contact_methods text[]");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS preferred_contact_method text");
    expect(migration).not.toContain("ALTER TYPE public.contact_channel");
  });

  it("allows only whatsapp, email and phone and caps the selection at three", () => {
    expect(migration).toContain("ARRAY['whatsapp', 'email', 'phone']");
    expect(migration).toContain("cardinality(contact_methods) <= 3");
    expect(migration).toContain("preferred_contact_method = ANY(contact_methods)");
  });

  it("retires legacy SMS preferences by backfilling them to email", () => {
    expect(migration).toContain("CASE preferred_contact_channel::text");
    expect(migration).toContain("ELSE ARRAY['email']::text[]");
  });

  it("preserves atomic profile saving through a wrapper around the hardened RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.save_therapist_profile_with_contacts");
    expect(migration).toContain("SELECT public.save_therapist_profile(_actor, _payload)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.save_therapist_profile_with_contacts");
    expect(migration).toContain("TO service_role");
  });
});
