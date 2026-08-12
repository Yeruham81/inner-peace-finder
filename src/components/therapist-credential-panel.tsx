import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelSource = readFileSync(join(import.meta.dir, "therapist-credential-panel.tsx"), "utf8");
const serverSource = readFileSync(join(import.meta.dir, "..", "lib", "therapist-profile.functions.ts"), "utf8");

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
    expect(panelSource).toMatch(/לא\s*\n?\s*יוצגו בגלוי בפרופיל הציבורי/);
  });

  it("validates and writes issue_date while leaving verification decisions server-controlled", () => {
    expect(serverSource).toContain("issue_date: z.string().date().nullable().optional()");
    expect(serverSource).toContain("issue_date: data.issue_date ?? null");
    expect(serverSource).toContain('verification_status: "pending_review" as const');
    expect(serverSource).not.toContain("expires_at: data.expires_at");
  });
});
