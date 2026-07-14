import { describe, expect, it } from "bun:test";
import { phraseMatchesDescription } from "./therapist-profile.functions";

describe("phraseMatchesDescription (Semantic Feedback filter)", () => {
  it("matches an exact canonical name", () => {
    expect(phraseMatchesDescription("חרדה", "המטופלים סובלים מחרדה קשה")).toBe(true);
  });

  it("tolerates yod/vav spelling variation (דכאונות ↔ דיכאון)", () => {
    expect(phraseMatchesDescription("דיכאון", "מטפלת בדכאונות ומשברי חיים")).toBe(true);
  });

  it("matches a compound-word variant (פוסטטראומה ↔ פוסט טראומה)", () => {
    expect(phraseMatchesDescription("פוסט טראומה", "התמחות בפוסטטראומה אישית וצבאית")).toBe(true);
  });

  it("matches a multi-word alias via token overlap (טיפול זוגי)", () => {
    expect(phraseMatchesDescription("טיפול זוגי", "אני מציעה גם טיפול זוגי לצעירים")).toBe(true);
  });

  it("does NOT match on a single unrelated token (no over-expansion)", () => {
    // Alias "טראומה" must not fire from an EMDR mention alone.
    expect(phraseMatchesDescription("הפרעות אכילה", "אני מטפל במבוגרים ומתבגרים")).toBe(false);
  });

  it("does NOT match when the phrase is absent entirely", () => {
    expect(phraseMatchesDescription("הורות", "עוסקת בחרדה ודיכאון בלבד")).toBe(false);
  });
});