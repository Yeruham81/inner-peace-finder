import { describe, expect, it } from "bun:test";

import { detectContactBypassTypes, scanContactPolicyFields, scanProfileContactPolicy } from "./profile-contact-policy";

describe("profile contact bypass policy", () => {
  it("detects Israeli phone numbers with separators", () => {
    expect(detectContactBypassTypes("אפשר ליצור איתי קשר ב-052 123 4567")).toContain("phone");
    expect(detectContactBypassTypes("טלפון 0-5-2-1-2-3-4-5-6-7")).toContain("phone");
  });

  it("detects phone numbers written as words, including grouped spoken numbers", () => {
    expect(
      detectContactBypassTypes("אפס חמש שתיים אחת שתיים שלוש ארבע חמש שש שבע"),
    ).toContain("phone");
    expect(detectContactBypassTypes("zero five two one two three four five six seven")).toContain("phone");
    expect(detectContactBypassTypes("אפסחמששתייםאחתשתייםשלושארבעחמששששבע")).toContain("phone");
    expect(detectContactBypassTypes("טלפון אפס חמישים ושתיים מאה עשרים שלוש")).toContain("phone");
  });

  it("does not flag ordinary years and experience counts as phone numbers", () => {
    expect(detectContactBypassTypes("אני מטפל משנת 2018 ובעל 12 שנות ניסיון")).not.toContain("phone");
  });

  it("detects normal, spaced and word-obfuscated email addresses", () => {
    expect(detectContactBypassTypes("moshe@example.com")).toContain("email");
    expect(detectContactBypassTypes("m o s h e @ g m a i l . c o m")).toContain("email");
    expect(detectContactBypassTypes("moshe שטרודל גימייל נקודה com")).toContain("email");
    expect(detectContactBypassTypes("moshe at gmail dot com")).toContain("email");
    expect(detectContactBypassTypes("moshe (at) gmail (dot) com")).toContain("email");
    expect(detectContactBypassTypes("m o s h e [ a t ] g m a i l [ d o t ] c o m")).toContain("email");
    expect(detectContactBypassTypes("m o s h e a t g m a i l d o t c o m")).toContain("email");
    expect(detectContactBypassTypes("moshe ש ט ר ו ד ל ג י מ י י ל נ ק ו ד ה com")).toContain("email");
    expect(detectContactBypassTypes("moshe בגימייל")).toContain("email");
  });

  it("detects direct and obfuscated websites without double-counting an email domain", () => {
    expect(detectContactBypassTypes("האתר שלי הוא https://example.com")).toContain("website");
    expect(detectContactBypassTypes("w w w . e x a m p l e . c o . i l")).toContain("website");
    expect(detectContactBypassTypes("example נקודה com")).toContain("website");
    expect(detectContactBypassTypes("example d o t c o m")).toContain("website");
    expect(detectContactBypassTypes("moshe@example.com")).not.toContain("website");
  });

  it("detects social handles and instructions to contact through social platforms", () => {
    expect(detectContactBypassTypes("אינסטגרם: @moshe_therapy")).toContain("social");
    expect(detectContactBypassTypes("אינסטגרם: m o s h e . t h e r a p y")).toContain("social");
    expect(detectContactBypassTypes("@ m o s h e _ t h e r a p y")).toContain("social");
    expect(detectContactBypassTypes("חפשו אותי בפייסבוק בשם Moshe Therapy")).toContain("social");
    expect(detectContactBypassTypes("שלחו לי הודעה בוואטסאפ")).toContain("social");
  });

  it("limits profile enforcement to the three narrative fields and excludes address", () => {
    const result = scanProfileContactPolicy({
      full_description: "טיפול בחרדה ובמשברי חיים",
      education_training: "תואר שני משנת 2018",
      professional_experience: "12 שנות ניסיון מקצועי",
      // Runtime form/profile objects contain additional properties; the policy
      // intentionally ignores them, including address/location data.
      locations: [{ address: "הברזל 34, תל אביב — 052 123 4567" }],
    } as Parameters<typeof scanProfileContactPolicy>[0] & { locations: Array<{ address: string }> });

    expect(result.fieldKeys).toEqual([]);
    expect(result.types).toEqual([]);
  });

  it("returns the exact profile fields that contain forbidden contact details", () => {
    const result = scanContactPolicyFields([
      { key: "full_description", label: "קצת עליי", value: "טיפול בחרדה. טלפון 052-123-4567" },
      { key: "education_training", label: "השכלה", value: "תואר שני משנת 2018" },
    ]);

    expect(result.fieldKeys).toEqual(["full_description"]);
    expect(result.types).toContain("phone");
  });

  it("enforces each of the three allowed profile fields", () => {
    const result = scanProfileContactPolicy({
      full_description: "אפשר לפנות אליי ב-052-123-4567",
      education_training: "פרטים נוספים ב-example dot com",
      professional_experience: "moshe at gmail dot com",
    });

    expect(result.fieldKeys).toEqual([
      "full_description",
      "education_training",
      "professional_experience",
    ]);
    expect(result.types).toEqual(expect.arrayContaining(["phone", "website", "email"]));
  });
});
