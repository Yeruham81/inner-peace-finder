import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeRecruitmentEmail, normalizeRecruitmentPhone, parseRecruitmentCsv } from "./recruitment-import";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const route = read("src/routes/admin/recruitment.tsx");
const functions = read("src/lib/admin-recruitment.functions.ts");
const migration = read("supabase/migrations/20260901095500_therapist_recruitment_imports.sql");
const nav = read("src/components/admin/admin-nav.ts");

 describe("therapist recruitment import", () => {
  it("normalizes emails and rejects malformed values", () => {
    expect(normalizeRecruitmentEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(normalizeRecruitmentEmail("person@example")).toBeNull();
    expect(normalizeRecruitmentEmail("person example.com")).toBeNull();
  });

  it("parses quoted CSV values, optional names and file-local duplicates", () => {
    const parsed = parseRecruitmentCsv(
      'email,first_name,last_name\n"One@Example.com","Dana, Dr.",Cohen\none@example.com,Duplicate,Row\ntwo@example.com,Noa,Levi\n',
    );
    expect(parsed.totalRows).toBe(3);
    expect(parsed.rows[0]).toMatchObject({
      normalizedEmail: "one@example.com",
      firstName: "Dana, Dr.",
      lastName: "Cohen",
      parseStatus: "valid",
    });
    expect(parsed.rows[1].parseStatus).toBe("duplicate_file");
    expect(parsed.rows[2].normalizedEmail).toBe("two@example.com");

    const semicolon = parseRecruitmentCsv("email;first_name;last_name\nthree@example.com;Tal;Levi\n");
    expect(semicolon.rows[0]).toMatchObject({ normalizedEmail: "three@example.com", firstName: "Tal", lastName: "Levi" });
  });

  it("keeps phone normalization infrastructure explicit without enabling phone import", () => {
    expect(normalizeRecruitmentPhone("+972-50-123-4567")).toBe("+972501234567");
    expect(normalizeRecruitmentPhone("050-123-4567")).toBeNull();
    expect(route).toContain("לא מיובאים ולא נשמרים מספרי טלפון");
    expect(route).not.toContain('accept=".csv,text/csv,.xlsx"');
  });

  it("enforces one durable invitation row per channel and normalized destination", () => {
    expect(migration).toContain("therapist_recruitment_invitations_channel_destination_key");
    expect(migration).toContain("ON public.therapist_recruitment_invitations(channel, destination_normalized)");
    expect(functions).toContain('onConflict: "channel,destination_normalized"');
    expect(functions).toContain("ignoreDuplicates: true");
  });

  it("distinguishes provider acceptance from failed or unknown submission", () => {
    expect(migration).toContain("'submission_failed'");
    expect(migration).toContain("'submission_unknown'");
    expect(migration).toContain("submitted_at timestamptz");
    expect(migration).toContain("Once set, the one-invitation rule is consumed even if delivery later bounces");
    expect(migration).toContain("submission_unknown must never retry automatically");
  });

  it("prepares channel-scoped opt-out suppression and also respects the existing global email registry", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.therapist_recruitment_suppressions");
    expect(migration).toContain("'recipient_opt_out'");
    expect(migration).toContain("public.contact_email_suppressions");
    expect(functions).toContain('.from("therapist_recruitment_suppressions")');
    expect(functions).toContain('return previewRow(row, "suppressed")');
  });

  it("does not import addresses that already belong to an account, profile or previous invitation", () => {
    expect(migration).toContain("JOIN public.therapist_accounts AS account");
    expect(migration).toContain("FROM public.therapists AS therapist");
    expect(functions).toContain('previewRow(row, "already_registered")');
    expect(functions).toContain('previewRow(row, "existing_profile")');
    expect(functions).toContain('previewRow(row, "already_invited")');
  });

  it("keeps all import and list operations behind server-side admin authorization", () => {
    expect(functions.match(/\.middleware\(\[requireSupabaseAuth\]\)/g)?.length).toBe(3);
    expect(functions.match(/requireTipulinksAdmin\(context\.claims/g)?.length).toBe(3);
    expect(migration).toContain("REVOKE ALL ON TABLE public.therapist_recruitment_invitations FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT ALL ON TABLE public.therapist_recruitment_invitations TO service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_recruitment_email_conflicts(text[])");
  });

  it("provides preview/import UI but intentionally performs no real delivery in phase one", () => {
    expect(route).toContain("תצוגה מקדימה");
    expect(route).toContain("לא נשלחה עדיין אף הודעה");
    expect(route).toContain("בשלב זה המערכת אינה שולחת הודעות בפועל");
    expect(functions).not.toContain("Brevo");
    expect(functions).not.toContain("TWILIO_");
    expect(functions).not.toContain("sendTransacEmail");
  });

  it("adds the recruitment screen to the admin navigation", () => {
    expect(nav).toContain('{ to: "/admin/recruitment", label: "הזמנות מטפלים"');
    expect(route).toContain('createFileRoute("/admin/recruitment")');
  });
});
