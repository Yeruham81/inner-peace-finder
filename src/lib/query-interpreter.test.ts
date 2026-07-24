import { describe, expect, it } from "bun:test";
import { interpretQuery } from "./query-interpreter";
import type { Catalog } from "./query-interpreter.types";

const catalog: Catalog = {
  professions: [
    {
      id: "p1",
      slug: "psychologist",
      name_he: "פסיכולוג",
      nameVariants: ["פסיכולוג", "פסיכולוגית", "psychologist"],
      feminineVariants: ["פסיכולוגית"],
    },
    {
      id: "p2",
      slug: "social-worker",
      name_he: "עובד סוציאלי",
      nameVariants: ["עובד סוציאלי", "עובדת סוציאלית"],
      feminineVariants: ["עובדת סוציאלית"],
    },
  ],
  modalities: [
    { id: "m1", slug: "cbt", name_he: "טיפול קוגניטיבי התנהגותי", nameVariants: ["טיפול קוגניטיבי התנהגותי", "cbt"] },
    { id: "m2", slug: "psychodynamic", name_he: "פסיכודינמי", nameVariants: ["פסיכודינמי"] },
  ],
  populations: [],
  languages: [],
  cities: [
    { canonical: "תל אביב", aliases: ["תל אביב", 'ת"א', "תא"] },
    { canonical: "ירושלים", aliases: ["ירושלים"] },
  ],
  therapistNames: [{ id: "t1", fullName: "יעל כהן", tokens: ["יעל", "כהן"] }],
  firstNameCount: new Map([["יעל", 1], ["כהן", 1]]),
};

describe("interpretQuery", () => {
  it("strips generic request prefix before detecting primary intent", () => {
    const r = interpretQuery("אני מחפש פסיכולוגית בתל אביב", catalog);
    expect(r.hardFilters.professionSlugs).toContain("psychologist");
    expect(r.hardFilters.city).toBe("תל אביב");
    expect(r.hardFilters.therapistGender).toBe("female");
    expect(r.genderEvidence).toContain("feminine_profession_form");
    expect(r.intent).toBe("structured");
  });

  it("does NOT infer female from masculine profession form", () => {
    const r = interpretQuery("פסיכולוג בירושלים", catalog);
    expect(r.hardFilters.therapistGender).toBeNull();
  });

  it("only accepts explicit female tokens or feminine profession forms for female gender", () => {
    const r = interpretQuery("אשמח לקבל אישה מטפלת", catalog);
    expect(r.hardFilters.therapistGender).toBe("female");
    expect(r.genderEvidence).toContain("explicit_female");
  });

  it("treats 'גבר' as the only explicit male trigger", () => {
    const r = interpretQuery("אני מחפש גבר פסיכולוג", catalog);
    expect(r.hardFilters.therapistGender).toBe("male");
  });

  it("routes preference-marked entities to softPreferences, not hardFilters", () => {
    const r = interpretQuery("פסיכולוגית עדיף פסיכודינמי", catalog);
    expect(r.hardFilters.professionSlugs).toContain("psychologist");
    expect(r.hardFilters.modalitySlugs).not.toContain("psychodynamic");
    expect(r.softPreferences.modalitySlugs).toContain("psychodynamic");
  });

  it("returns unresolved_service when primary slot is an unsupported service", () => {
    const r = interpretQuery("אני מחפש מאבחן קשב", catalog);
    expect(r.unresolvedPrimary).toBe(true);
    expect(r.intent).toBe("unresolved_service");
    expect(r.unresolvedCodes).toContain("unrecognized_service");
  });

  it("captures a therapist name when unambiguous", () => {
    const r = interpretQuery("יעל כהן", catalog);
    expect(r.therapistNameIds).toEqual(["t1"]);
    expect(r.intent).toBe("named");
  });

  it("empties out on empty query", () => {
    const r = interpretQuery("   ", catalog);
    expect(r.intent).toBe("unknown");
    expect(r.unresolvedCodes).toContain("empty_query");
  });

  it("gender conflict is not resolved to either value", () => {
    const r = interpretQuery("אישה גבר פסיכולוג", catalog);
    expect(r.hardFilters.therapistGender).toBeNull();
    expect(r.unresolvedCodes).toContain("gender_conflict");
  });

  it("puts unrecognized remainder into semanticRemainder", () => {
    const r = interpretQuery("פסיכולוגית עם ניסיון בטראומה", catalog);
    expect(r.semanticRemainder.length).toBeGreaterThan(0);
    expect(r.intent).toBe("hybrid");
  });
});