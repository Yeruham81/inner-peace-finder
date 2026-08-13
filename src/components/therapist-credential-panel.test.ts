import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelSource = readFileSync(join(import.meta.dir, "therapist-credential-panel.tsx"), "utf8");
const serverSource = readFileSync(join(import.meta.dir, "..", "lib", "therapist-profile.functions.ts"), "utf8");
const deletionSource = readFileSync(join(import.meta.dir, "..", "lib", "profile-management.server.ts"), "utf8");

describe("therapist credential verification form", () => {
  it("collects the credential issue/effective date instead of an expiry date", () => {
    expect(panelSource).toContain("תאריך קבלת ההסמכה או כניסתה לתוקף");
    expect(panelSource).toContain("credential?.issue_date");
    expect(panelSource).toContain("issue_date: issueDate || null");
    expect(panelSource).not.toContain("תאריך תפוגה");
    expect(panelSource).not.toContain("expires_at:");
  });

  it("explains the privacy boundary and uses the approved submission label", () => {
    expect(panelSource).toContain("שליחת הפרטים לאימות");
    expect(panelSource).toContain("אימות ההכשרה או ההסמכה");
    expect(panelSource).toMatch(/לא\s+יוצגו בגלוי בפרופיל\s+הציבורי/);
  });

  it("validates and writes issue_date while leaving verification decisions server-controlled", () => {
    expect(serverSource).toContain("issue_date: z.string().date().nullable().optional()");
    expect(serverSource).toContain("issue_date: data.issue_date ?? null");
    expect(serverSource).toContain('verification_status: "pending_review" as const');
    expect(serverSource).not.toContain("expires_at: data.expires_at");
  });

  it("loads and renders every credential and offers a fresh form after submission", () => {
    expect(serverSource).toContain('credentials: (credentials.data ?? []) as ProfileEditorData["credentials"]');
    expect(serverSource).not.toContain(".limit(1)");
    expect(panelSource).toContain("credentials.map((credential, index)");
    expect(panelSource).toContain("הוספת הסמכה נוספת");
    expect(panelSource).toContain("אפשר להוסיף הסמכה נוספת");
  });

  it("arranges the six credential fields in three desktop columns", () => {
    expect(panelSource).toContain('className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"');
    for (const label of [
      "מקצוע",
      "סוג ההסמכה",
      "מספר רישיון",
      "הגוף המנפיק",
      "מוסד לימודים או הכשרה",
      "תאריך קבלת ההסמכה או כניסתה לתוקף",
    ]) {
      expect(panelSource).toContain(label);
    }
  });

  it("uses the authenticated user id as the private storage prefix", () => {
    expect(panelSource).toContain("await supabase.auth.getUser()");
    expect(panelSource).toContain("`${user.id}/${crypto.randomUUID()}.${extension}`");
    expect(serverSource).toContain("data.document_url.startsWith(`${context.userId}/`)");
    expect(panelSource).not.toContain("`${therapistId}/credential-");
  });

  it("shows explicit workflow statuses, including verified", () => {
    for (const label of ["טרם הוגש", "ממתין לאימות", "מאומת", "נדחה", "פג תוקף"]) {
      expect(panelSource).toContain(label);
    }
  });

  it("cleans both authenticated-user and legacy credential storage paths on permanent deletion", () => {
    expect(deletionSource).toContain('"therapist-credentials": [...new Set([authUserId, profile.id])]');
    expect(serverSource).toContain("permanentlyDeleteOwnedProfile(accountId, context.userId)");
  });
});
