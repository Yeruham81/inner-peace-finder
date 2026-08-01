/**
 * Multi-word preference markers ("אם אפשר") must behave exactly like the
 * single-word markers ("עדיף", "רצוי", "כדאי"): they stay in scope across
 * transparent feminine-profession and filler-prefix tokens.
 */

import { describe, expect, it } from "bun:test";
import { buildSearchCatalog, type ProfessionRow } from "./catalog-builder";
import { interpretQuery } from "./query-interpreter";

const PROFESSION_ROWS: ProfessionRow[] = [
  { id: "p1", slug: "psychologist", name_he: "פסיכולוג", name_en: "Psychologist" },
  { id: "p4", slug: "therapist", name_he: "מטפל", name_en: "Therapist" },
];

const catalog = buildSearchCatalog({
  professions: PROFESSION_ROWS,
  modalities: [{ id: "m1", slug: "cbt", name_he: "CBT", name_en: "CBT" }],
  populations: [{ slug: "children", name: "ילדים" }],
  languages: [{ code: "ru", name: "רוסית" }],
  cities: [{ city: "חיפה" }],
  therapistNames: [],
});

const MARKERS = ["עדיף", "רצוי", "כדאי", "אם אפשר"];

describe("preference-marker routing", () => {
  for (const marker of MARKERS) {
    it(`'${marker} מטפלת ב-CBT בחיפה' routes gender + modality to soft preferences`, () => {
      const r = interpretQuery(`${marker} מטפלת ב-CBT בחיפה`, catalog);
      expect(r.hardFilters.therapistGender).toBeNull();
      expect(r.softPreferences.genders).toContain("female");
      expect(r.softPreferences.modalitySlugs).toContain("cbt");
      expect(r.hardFilters.modalitySlugs).not.toContain("cbt");
      expect(r.hardFilters.cityNames).toContain("חיפה");
    });

    it(`'${marker}' and the filler prefix do not leak into semanticRemainder`, () => {
      const r = interpretQuery(`${marker} מטפלת ב-CBT בחיפה`, catalog);
      for (const part of marker.split(" ")) {
        expect(r.semanticRemainder).not.toContain(part);
      }
      expect(r.semanticRemainder.trim()).toBe("");
    });
  }
});

describe("explicit male gender evidence", () => {
  const cases: Array<[string, boolean]> = [
    ["פסיכולוג גבר", true],
    ["מטפל גבר", true],
    ["אני גבר שמחפש טיפול בחרדה", false],
    ["טיפול לגבר עם חרדה", false],
  ];
  for (const [query, expectMale] of cases) {
    it(`'${query}' ${expectMale ? "creates" : "does not create"} male therapist-gender evidence`, () => {
      const r = interpretQuery(query, catalog);
      if (expectMale) {
        expect(r.genderEvidence).toContain("explicit_male");
        expect(r.hardFilters.therapistGender).toBe("male");
      } else {
        expect(r.genderEvidence).not.toContain("explicit_male");
        expect(r.hardFilters.therapistGender).toBeNull();
      }
    });
  }

  it("'פסיכולוגית גבר' produces a gender_conflict", () => {
    const r = interpretQuery("פסיכולוגית גבר", catalog);
    expect(r.unresolvedCodes).toContain("gender_conflict");
  });
});
