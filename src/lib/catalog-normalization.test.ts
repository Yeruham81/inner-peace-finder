/**
 * Production catalog-builder ↔ interpreter normalization contract.
 *
 * The catalog here is produced by the REAL `buildSearchCatalog` from
 * database-shaped canonical rows (masculine `name_he` only — exactly what
 * the `professions` table stores). Nothing is hand-expanded into variants.
 */

import { describe, expect, it } from "bun:test";
import { buildSearchCatalog, type ProfessionRow } from "./catalog-builder";
import { interpretQuery } from "./query-interpreter";
import { normalizeForInterpretation } from "./query-normalization";

const PROFESSION_ROWS: ProfessionRow[] = [
  { id: "p1", slug: "psychologist", name_he: "פסיכולוג", name_en: "Psychologist" },
  { id: "p2", slug: "psychiatrist", name_he: "פסיכיאטר", name_en: "Psychiatrist" },
  { id: "p3", slug: "social-worker", name_he: "עובד סוציאלי", name_en: "Social worker" },
  { id: "p4", slug: "therapist", name_he: "מטפל", name_en: "Therapist" },
];

function catalogFrom(professions: ProfessionRow[], cityOrder = ["חיפה", "תל אביב", "ירושלים"]) {
  return buildSearchCatalog({
    professions,
    modalities: [{ id: "m1", slug: "cbt", name_he: "CBT", name_en: "CBT" }],
    populations: [{ slug: "children", name: "ילדים" }],
    languages: [{ code: "ru", name: "רוסית" }],
    cities: cityOrder.map((city) => ({ city })),
    therapistNames: [],
  });
}

describe("production catalog builder + interpreter", () => {
  it("'פסיכולוגית בחיפה' → psychologist + female evidence + Haifa", () => {
    const r = interpretQuery("פסיכולוגית בחיפה", catalogFrom(PROFESSION_ROWS));
    expect(r.hardFilters.professionSlugs).toEqual(["psychologist"]);
    expect(r.hardFilters.therapistGender).toBe("female");
    expect(r.genderEvidence).toContain("feminine_profession_form");
    expect(r.hardFilters.cityNames).toEqual(["חיפה"]);
  });

  const feminineCases: Array<[string, string]> = [
    ["פסיכולוגית", "psychologist"],
    ["פסיכיאטרית", "psychiatrist"],
    ["עובדת סוציאלית", "social-worker"],
    ["מטפלת", "therapist"],
  ];
  for (const [form, slug] of feminineCases) {
    it(`recognizes the production feminine form '${form}' → ${slug} + female`, () => {
      const r = interpretQuery(`${form} בחיפה`, catalogFrom(PROFESSION_ROWS));
      expect(r.hardFilters.professionSlugs).toContain(slug);
      expect(r.hardFilters.therapistGender).toBe("female");
      expect(r.hardFilters.cityNames).toEqual(["חיפה"]);
    });
  }

  it("catalog row ordering does not change profession, gender evidence, or city", () => {
    const orders: ProfessionRow[][] = [
      PROFESSION_ROWS,
      [...PROFESSION_ROWS].reverse(),
      [PROFESSION_ROWS[3]!, PROFESSION_ROWS[0]!, PROFESSION_ROWS[2]!, PROFESSION_ROWS[1]!],
      [PROFESSION_ROWS[2]!, PROFESSION_ROWS[1]!, PROFESSION_ROWS[3]!, PROFESSION_ROWS[0]!],
    ];
    const cityOrders = [
      ["חיפה", "תל אביב", "ירושלים"],
      ["ירושלים", "חיפה", "תל אביב"],
      ["תל אביב", "ירושלים", "חיפה"],
    ];
    const seen = new Set<string>();
    for (const professions of orders) {
      for (const cityOrder of cityOrders) {
        const r = interpretQuery("פסיכולוגית בחיפה", catalogFrom(professions, cityOrder));
        seen.add(
          JSON.stringify({
            prof: r.hardFilters.professionSlugs,
            gender: r.hardFilters.therapistGender,
            evidence: r.genderEvidence,
            cities: r.hardFilters.cityNames,
          }),
        );
      }
    }
    expect(seen.size).toBe(1);
    expect([...seen][0]).toContain("psychologist");
  });

  it("'עדיף מטפלת ב-CBT בחיפה' on the production catalog → soft gender + soft CBT + hard city", () => {
    const r = interpretQuery("עדיף מטפלת ב-CBT בחיפה", catalogFrom(PROFESSION_ROWS));
    expect(r.hardFilters.therapistGender).toBeNull();
    expect(r.softPreferences.genders).toContain("female");
    expect(r.softPreferences.modalitySlugs).toContain("cbt");
    expect(r.hardFilters.modalitySlugs).not.toContain("cbt");
    expect(r.hardFilters.cityNames).toContain("חיפה");
    const remainder = r.semanticRemainder.split(/\s+/).filter(Boolean);
    expect(remainder).not.toContain("עדיף");
    expect(remainder).not.toContain("עדיפ");
    expect(remainder).not.toContain("cbt");
    expect(remainder).not.toContain("ב");
  });

  it("catalog variants are produced by the SAME normalization function as the query", () => {
    const catalog = catalogFrom(PROFESSION_ROWS);
    const psych = catalog.professions.find((p) => p.slug === "psychologist")!;
    // Every stored variant is already normalized (idempotent under the
    // shared contract), and the feminine form the query uses is present.
    for (const v of psych.nameVariants) {
      expect(normalizeForInterpretation(v)).toBe(v);
    }
    expect(psych.nameVariants).toContain(normalizeForInterpretation("פסיכולוגית"));
    expect(psych.feminineVariants).toContain(normalizeForInterpretation("פסיכולוגית"));
    for (const city of catalog.cities) {
      for (const alias of city.aliases) expect(normalizeForInterpretation(alias)).toBe(alias);
    }
  });
});
