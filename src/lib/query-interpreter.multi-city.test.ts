import { describe, expect, it } from "bun:test";
import { interpretQuery } from "./query-interpreter";
import type { Catalog } from "./query-interpreter.types";

const BASE_CITIES = [
  { canonical: "חיפה", aliases: ["חיפה", "haifa"] },
  { canonical: "תל אביב", aliases: ["תל אביב", 'ת"א', "תא"] },
  { canonical: "ירושלים", aliases: ["ירושלים"] },
  { canonical: "רחובות", aliases: ["רחובות"] },
  { canonical: "באר שבע", aliases: ["באר שבע"] },
];

function permute<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permute(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function makeCatalog(cities: typeof BASE_CITIES): Catalog {
  return {
    professions: [
      {
        id: "p1",
        slug: "psychologist",
        name_he: "פסיכולוג",
        nameVariants: ["פסיכולוג", "פסיכולוגית"],
        feminineVariants: ["פסיכולוגית"],
      },
    ],
    modalities: [{ id: "m1", slug: "cbt", name_he: "CBT", nameVariants: ["cbt", "CBT"] }],
    populations: [],
    languages: [],
    cities,
    therapistNames: [],
    firstNameCount: new Map(),
  };
}

function runAllPermutations(query: string) {
  const results = permute(BASE_CITIES).map((cities) => interpretQuery(query, makeCatalog(cities)));
  const canonical = results.map((r) =>
    JSON.stringify({
      hard: r.hardFilters,
      soft: r.softPreferences,
      remainder: r.semanticRemainder,
      intent: r.intent,
    }),
  );
  const distinct = new Set(canonical);
  return { first: results[0]!, distinctCount: distinct.size, results };
}

describe("interpretQuery — modality span + city extraction under multi-city catalog", () => {
  it("'עדיף מטפלת ב-CBT בחיפה' — CBT/female soft, חיפה hard, no leaked markers", () => {
    const { first, distinctCount, results } = runAllPermutations("עדיף מטפלת ב-CBT בחיפה");
    expect(distinctCount).toBe(1);
    expect(first.softPreferences.modalitySlugs).toContain("cbt");
    expect(first.hardFilters.modalitySlugs).not.toContain("cbt");
    // "עדיף" scopes BOTH the gender and the modality as soft preferences.
    expect(first.hardFilters.therapistGender).toBe(null);
    expect(first.softPreferences.genders).toContain("female");
    expect(first.hardFilters.cityNames).toContain("חיפה");
    const remainderTokens = first.semanticRemainder.split(/\s+/).filter(Boolean);
    expect(remainderTokens).not.toContain("עדיף");
    expect(remainderTokens).not.toContain("עדיפ"); // sofit-folded form
    expect(remainderTokens).not.toContain("cbt");
    expect(remainderTokens).not.toContain("ב");
    // Every permutation must agree with the first.
    for (const r of results) expect(r.hardFilters.cityNames).toContain("חיפה");
  });

  it("'מטפלת ב-CBT בתל אביב' — CBT hard, תל אביב hard, invariant across permutations", () => {
    const { first, distinctCount } = runAllPermutations("מטפלת ב-CBT בתל אביב");
    expect(distinctCount).toBe(1);
    expect(first.hardFilters.modalitySlugs).toContain("cbt");
    expect(first.hardFilters.cityNames).toContain("תל אביב");
    expect(first.hardFilters.therapistGender).toBe("female");
  });

  it("'פסיכולוגית עם CBT בירושלים' — CBT hard, ירושלים hard", () => {
    const { first, distinctCount } = runAllPermutations("פסיכולוגית עם CBT בירושלים");
    expect(distinctCount).toBe(1);
    expect(first.hardFilters.professionSlugs).toContain("psychologist");
    expect(first.hardFilters.modalitySlugs).toContain("cbt");
    expect(first.hardFilters.cityNames).toContain("ירושלים");
  });

  it("'עדיף CBT ברחובות' — CBT soft, רחובות hard, 'עדיף' consumed", () => {
    const { first, distinctCount } = runAllPermutations("עדיף CBT ברחובות");
    expect(distinctCount).toBe(1);
    expect(first.softPreferences.modalitySlugs).toContain("cbt");
    expect(first.hardFilters.cityNames).toContain("רחובות");
    const remainderTokens = first.semanticRemainder.split(/\s+/).filter(Boolean);
    expect(remainderTokens).not.toContain("עדיף");
    expect(remainderTokens).not.toContain("עדיפ");
  });

  it("'מטפלת ב-CBT בבאר שבע' — multi-word city is extracted with prefix stripped", () => {
    const { first, distinctCount } = runAllPermutations("מטפלת ב-CBT בבאר שבע");
    expect(distinctCount).toBe(1);
    expect(first.hardFilters.modalitySlugs).toContain("cbt");
    expect(first.hardFilters.cityNames).toContain("באר שבע");
  });
});
