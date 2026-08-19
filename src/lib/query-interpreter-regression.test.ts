/**
 * Stage 2 regression suite: deterministic natural-language routing.
 *
 * These cases protect the boundary between canonical structured filters and
 * the semantic/LLM remainder. A query that is fully described by a known
 * search axis must not leave filler behind just because Hebrew phrasing varies.
 */

import { describe, expect, it } from "bun:test";
import { buildSearchCatalog } from "./catalog-builder";
import { applyExplicitFilters, EMPTY_EXPLICIT } from "./explicit-filters";
import { interpretQuery, __internals } from "./query-interpreter";
import type { SoftPreferences, StructuredFilters } from "./query-interpreter.types";

const catalog = buildSearchCatalog({
  professions: [
    { id: "p1", slug: "psychologist", name_he: "פסיכולוג", name_en: "Psychologist" },
  ],
  modalities: [],
  populations: [
    { slug: "children", name: "ילדים" },
    { slug: "parents-families", name: "הורים ומשפחות" },
  ],
  languages: [
    { code: "ru", name: "רוסית" },
    { code: "he", name: "עברית" },
  ],
  cities: [{ city: "חיפה" }, { city: "ירושלים" }, { city: "בית שמש" }],
  therapistNames: [],
});

describe("therapy-format interpretation", () => {
  const cases: Array<[string, string]> = [
    ["טיפול פרטני", "individual"],
    ["טיפול זוגי", "couples"],
    ["טיפול משפחתי", "family"],
    ["טיפול הורה וילד", "parent_child"],
    ["טיפול קבוצתי", "group"],
    ["הדרכת הורים", "parent_guidance"],
    ["הדרכה הורית", "parent_guidance"],
  ];

  for (const [query, slug] of cases) {
    it(`${query} → ${slug} without semantic remainder`, () => {
      const out = interpretQuery(query, catalog);
      expect(out.hardFilters.therapyFormatSlugs).toContain(slug);
      expect(out.unresolvedPrimary).toBe(false);
      expect(out.semanticRemainder).toBe("");
      expect(out.intent).toBe("structured");
    });
  }

  it("keeps a query-inferred therapy format when the UI sends no explicit format", () => {
    const hard: StructuredFilters = {
      professionSlugs: [],
      modalitySlugs: [],
      populationSlugs: [],
      languageCodes: [],
      deliveryModes: [],
      cityNames: [],
      regionSlugs: [],
      therapyFormatSlugs: ["couples"],
      therapistGender: null,
    };
    const soft: SoftPreferences = {
      professionSlugs: [],
      modalitySlugs: [],
      populationSlugs: [],
      languageCodes: [],
      cities: [],
      deliveryModes: [],
      genders: [],
    };
    const out = applyExplicitFilters(hard, soft, EMPTY_EXPLICIT);
    expect(out.hardFilters.therapyFormatSlugs).toEqual(["couples"]);
  });

  it("an explicit therapy format still overrides an inferred conflicting format", () => {
    const hard: StructuredFilters = {
      professionSlugs: [],
      modalitySlugs: [],
      populationSlugs: [],
      languageCodes: [],
      deliveryModes: [],
      cityNames: [],
      regionSlugs: [],
      therapyFormatSlugs: ["couples"],
      therapistGender: null,
    };
    const soft: SoftPreferences = {
      professionSlugs: [],
      modalitySlugs: [],
      populationSlugs: [],
      languageCodes: [],
      cities: [],
      deliveryModes: [],
      genders: [],
    };
    const explicit = { ...EMPTY_EXPLICIT, therapyFormatSlugs: ["parent_guidance"] };
    const out = applyExplicitFilters(hard, soft, explicit);
    expect(out.hardFilters.therapyFormatSlugs).toEqual(["parent_guidance"]);
    expect(out.conflicts).toContainEqual({
      category: "therapyFormat",
      inferred: ["couples"],
      explicit: ["parent_guidance"],
    });
  });
});

describe("product-region interpretation", () => {
  const cases: Array<[string, string]> = [
    ["טיפול בצפון", "north"],
    ["מטפל בקריות", "haifa-krayot"],
    ["טיפול באזור השרון", "sharon"],
    ["טיפול בגוש דן", "tel-aviv-gush-dan"],
    ["טיפול במרכז", "center-shfela"],
    ["טיפול באזור ירושלים", "jerusalem-area"],
    ["טיפול ביהודה ושומרון", "judea-samaria"],
    ["טיפול בדרום", "south"],
  ];

  for (const [query, slug] of cases) {
    it(`${query} → ${slug}`, () => {
      const out = interpretQuery(query, catalog);
      expect(out.hardFilters.regionSlugs).toContain(slug);
      expect(out.semanticRemainder).toBe("");
    });
  }

  it("keeps bare חיפה as an exact city, not the Haifa product region", () => {
    const out = interpretQuery("חיפה", catalog);
    expect(out.hardFilters.cityNames).toEqual(["חיפה"]);
    expect(out.hardFilters.regionSlugs).toEqual([]);
  });

  it("maps אזור חיפה to the region and not to the city", () => {
    const out = interpretQuery("אזור חיפה", catalog);
    expect(out.hardFilters.regionSlugs).toEqual(["haifa-krayot"]);
    expect(out.hardFilters.cityNames).toEqual([]);
    expect(out.semanticRemainder).toBe("");
  });

  it("maps אזור ירושלים to the region and not to the city", () => {
    const out = interpretQuery("אזור ירושלים", catalog);
    expect(out.hardFilters.regionSlugs).toEqual(["jerusalem-area"]);
    expect(out.hardFilters.cityNames).toEqual([]);
  });

  it("combines a known format and region without semantic/LLM residue", () => {
    const out = interpretQuery("טיפול זוגי באזור השרון", catalog);
    expect(out.hardFilters.therapyFormatSlugs).toEqual(["couples"]);
    expect(out.hardFilters.regionSlugs).toEqual(["sharon"]);
    expect(out.semanticRemainder).toBe("");
  });
});

describe("delivery-mode interpretation and false-positive protection", () => {
  const cases: Array<[string, string]> = [
    ["פגישה אונליין", "online"],
    ["טיפול מרחוק", "online"],
    ["פנים אל פנים", "clinic"],
    ["טיפול בקליניקה", "clinic"],
    ["ביקורי בית", "home_visit"],
    ["טיפול בבית", "home_visit"],
  ];

  for (const [query, mode] of cases) {
    it(`${query} → ${mode} with no filler remainder`, () => {
      const out = interpretQuery(query, catalog);
      expect(out.hardFilters.deliveryModes).toContain(mode);
      expect(out.semanticRemainder).toBe("");
    });
  }

  for (const query of ["קשיים בבית הספר", "טיפול בבית הספר", "טיפול בבית חולים"]) {
    it(`${query} does NOT imply home visits`, () => {
      const out = interpretQuery(query, catalog);
      expect(out.hardFilters.deliveryModes).not.toContain("home_visit");
    });
  }

  it("טיפול בבית שמש resolves the locality instead of home_visit", () => {
    const out = interpretQuery("טיפול בבית שמש", catalog);
    expect(out.hardFilters.deliveryModes).not.toContain("home_visit");
    expect(out.hardFilters.cityNames).toEqual(["בית שמש"]);
    expect(out.semanticRemainder).toBe("");
  });
});

describe("gender routing protects patient self-description", () => {
  it("אני אישה שמחפשת טיפול does not request a female therapist", () => {
    const out = interpretQuery("אני אישה שמחפשת טיפול בחרדה", catalog);
    expect(out.hardFilters.therapistGender).toBeNull();
    expect(out.genderEvidence).not.toContain("explicit_female");
  });

  it("מטופל גבר does not request a male therapist", () => {
    const out = interpretQuery("מטופל גבר מחפש טיפול", catalog);
    expect(out.hardFilters.therapistGender).toBeNull();
    expect(out.genderEvidence).not.toContain("explicit_male");
  });

  it("מטפל גבר remains an explicit male-therapist request", () => {
    const out = interpretQuery("מטפל גבר", catalog);
    expect(out.hardFilters.therapistGender).toBe("male");
    expect(out.genderEvidence).toContain("explicit_male");
  });

  it("מטפלת אישה remains an explicit female-therapist request", () => {
    const out = interpretQuery("מטפלת אישה", catalog);
    expect(out.hardFilters.therapistGender).toBe("female");
  });

  for (const query of [
    "אין לי העדפה למגדר פסיכולוג",
    "לא משנה לי גבר או אישה פסיכולוג",
    "לא משנה לי מטפל או מטפלת פסיכולוג",
  ]) {
    it(`${query} consumes the no-preference phrase without a gender filter`, () => {
      const out = interpretQuery(query, catalog);
      expect(out.hardFilters.therapistGender).toBeNull();
      expect(out.softPreferences.genders).toEqual([]);
      expect(out.unresolvedCodes).not.toContain("gender_conflict");
      expect(out.hardFilters.professionSlugs).toEqual(["psychologist"]);
      expect(out.semanticRemainder).toBe("");
    });
  }

  it("פסיכולוג או פסיכולוגית keeps the profession but no gender preference", () => {
    const out = interpretQuery("פסיכולוג או פסיכולוגית", catalog);
    expect(out.hardFilters.professionSlugs).toEqual(["psychologist"]);
    expect(out.hardFilters.therapistGender).toBeNull();
    expect(out.genderEvidence).not.toContain("feminine_profession_form");
    expect(out.semanticRemainder).toBe("");
  });

});

describe("language structural cues", () => {
  for (const query of ["מטפל דובר רוסית", "מטפל שמדבר רוסית", "מטפלת דוברת רוסית", "רוסית כשפת אם"]) {
    it(`${query} recognizes Russian without leaving a cue for the LLM`, () => {
      const out = interpretQuery(query, catalog);
      expect(out.hardFilters.languageCodes).toEqual(["ru"]);
      expect(out.semanticRemainder).toBe("");
    });
  }

  it("does not globally delete the semantic word שפה", () => {
    const out = interpretQuery("שפה ותקשורת", catalog);
    expect(out.semanticRemainder).toContain("שפה");
  });
});

describe("static alias maps", () => {
  it("do not assign one normalized phrase to two different structured categories", () => {
    const owners = new Map<string, string[]>();
    const add = (category: string, values: Record<string, string>) => {
      for (const phrase of Object.keys(values)) {
        const list = owners.get(phrase) ?? [];
        list.push(category);
        owners.set(phrase, list);
      }
    };
    add("delivery", __internals.DELIVERY_MODE_ALIASES);
    add("therapyFormat", __internals.THERAPY_FORMAT_ALIASES);
    add("region", __internals.REGION_QUERY_ALIASES);

    expect([...owners.entries()].filter(([, categories]) => new Set(categories).size > 1)).toEqual([]);
  });
});
