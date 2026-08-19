/**
 * Regression coverage for the REAL production catalog builder.
 *
 * These tests intentionally build the search catalog from the canonical DB
 * rows/migrations instead of hand-written interpreter fixtures. Their job is
 * to fail when a catalog item is added but its natural-language coverage is
 * forgotten.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildSearchCatalog,
  feminineFormsFor,
  HE_LANG_ALIASES,
  PROFESSION_LANGUAGE_VARIANTS,
  type ProfessionRow,
} from "./catalog-builder";
import { CANONICAL_MODALITIES } from "./modality-options";
import {
  CANONICAL_POPULATIONS,
  CANONICAL_POPULATION_ALIASES,
  populationAliasesFor,
} from "./population-options";
import { interpretQuery } from "./query-interpreter";
import { normalizeForInterpretation } from "./query-normalization";

const PROFESSION_SQL = readFileSync(
  "supabase/migrations/20260816020000_expand_professions_catalog.sql",
  "utf8",
);

function canonicalProfessionRows(): ProfessionRow[] {
  return [...PROFESSION_SQL.matchAll(/\('([^']+)', '([^']+)', '([^']*)', \d+, true\)/g)].map(
    (match, index) => ({
      id: `p-${index + 1}`,
      slug: match[1]!,
      name_he: match[2]!,
      name_en: match[3]!,
    }),
  );
}

const PROFESSION_ROWS = canonicalProfessionRows();

function productionCatalog() {
  return buildSearchCatalog({
    professions: PROFESSION_ROWS,
    modalities: CANONICAL_MODALITIES.map((modality, index) => ({
      id: `m-${index + 1}`,
      slug: modality.slug,
      name_he: modality.nameHe,
      name_en: modality.nameEn,
    })),
    populations: CANONICAL_POPULATIONS.map((population) => ({
      slug: population.slug,
      name: population.name,
    })),
    languages: [
      { code: "he", name: "עברית" },
      { code: "en", name: "אנגלית" },
      { code: "ar", name: "ערבית" },
      { code: "ru", name: "רוסית" },
      { code: "fr", name: "צרפתית" },
      { code: "es", name: "ספרדית" },
      { code: "de", name: "גרמנית" },
      { code: "am", name: "אמהרית" },
    ],
    cities: [],
    therapistNames: [],
  });
}

function ambiguousPhrases(
  entries: Array<{ slug: string; variants: readonly string[] }>,
): Array<{ phrase: string; slugs: string[] }> {
  const owners = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const raw of entry.variants) {
      const phrase = normalizeForInterpretation(raw);
      if (!phrase) continue;
      const slugs = owners.get(phrase) ?? new Set<string>();
      slugs.add(entry.slug);
      owners.set(phrase, slugs);
    }
  }
  return [...owners.entries()]
    .filter(([, slugs]) => slugs.size > 1)
    .map(([phrase, slugs]) => ({ phrase, slugs: [...slugs].sort() }));
}

describe("production profession language coverage", () => {
  it("tracks exactly the complete 72-profession canonical catalog", () => {
    expect(PROFESSION_ROWS).toHaveLength(72);
    expect(new Set(PROFESSION_ROWS.map((row) => row.slug)).size).toBe(72);

    const configured = Object.keys(PROFESSION_LANGUAGE_VARIANTS).sort();
    const canonical = PROFESSION_ROWS.map((row) => row.slug).sort();
    expect(configured).toEqual(canonical);
  });

  it("provides an explicit feminine form for every gendered canonical title", () => {
    // These three titles do not have a distinct written feminine form:
    // - a generic non-person category,
    // - "דולה",
    // - "מורה" (same unvocalized spelling for men and women).
    const genderNeutralWrittenForms = new Set([
      "other-therapeutic-profession",
      "doula",
      "alexander-technique-teacher",
    ]);

    const missing = PROFESSION_ROWS.filter(
      (row) => !genderNeutralWrittenForms.has(row.slug) && feminineFormsFor(row).length === 0,
    ).map((row) => row.slug);

    expect(missing).toEqual([]);
    expect(PROFESSION_ROWS.filter((row) => feminineFormsFor(row).length > 0)).toHaveLength(69);
  });

  it("recognizes every configured feminine profession title as that profession + feminine evidence", () => {
    const catalog = productionCatalog();

    for (const row of PROFESSION_ROWS) {
      for (const form of feminineFormsFor(row)) {
        const result = interpretQuery(form, catalog);
        expect(result.hardFilters.professionSlugs, `${form} → ${row.slug}`).toContain(row.slug);
        expect(result.genderEvidence, `${form} should carry feminine profession evidence`).toContain(
          "feminine_profession_form",
        );
      }
    }
  });

  it("contains no ambiguous normalized profession phrase across different slugs", () => {
    const catalog = productionCatalog();
    expect(
      ambiguousPhrases(
        catalog.professions.map((profession) => ({
          slug: profession.slug,
          variants: profession.nameVariants,
        })),
      ),
    ).toEqual([]);
  });

  it("covers important safe profession-title synonyms", () => {
    const catalog = productionCatalog();
    const cases: Array<[string, string]> = [
      ['עו"ס', "social-worker"],
      ['עו"ס קלינית', "clinical-social-worker"],
      ["קלינאית תקשורת", "speech-language-pathologist"],
      ["קלינאי שפה ותקשורת", "speech-language-pathologist"],
      ["מטפלת באמנות", "visual-art-therapist"],
      ["מטפל בתנועה", "dance-movement-therapist"],
      ["תזונאית קלינית", "clinical-dietitian"],
      ["קואצ'רית", "life-coach"],
      ["הרבליסטית", "herbal-medicine-practitioner"],
      ["מעסה רפואית", "massage-therapist"],
      ["מטפלת בקרניו סקראל", "craniosacral-therapist"],
    ];

    for (const [query, slug] of cases) {
      const result = interpretQuery(query, catalog);
      expect(result.hardFilters.professionSlugs, query).toContain(slug);
    }
  });
});

describe("production modality language coverage", () => {
  it("wires every canonical modality alias into the real search catalog", () => {
    const catalog = productionCatalog();

    for (const canonical of CANONICAL_MODALITIES) {
      const built = catalog.modalities.find((modality) => modality.slug === canonical.slug);
      expect(built, canonical.slug).toBeDefined();
      const variants = new Set(built!.nameVariants);
      for (const alias of canonical.aliases) {
        expect(variants.has(normalizeForInterpretation(alias)), `${canonical.slug}: ${alias}`).toBe(
          true,
        );
      }
    }
  });

  it("contains no ambiguous normalized modality phrase across different slugs", () => {
    const catalog = productionCatalog();
    expect(
      ambiguousPhrases(
        catalog.modalities.map((modality) => ({
          slug: modality.slug,
          variants: modality.nameVariants,
        })),
      ),
    ).toEqual([]);
  });

  it("recognizes representative aliases that previously existed only in modality-options", () => {
    const catalog = productionCatalog();
    const cases: Array<[string, string]> = [
      ["טיפול דינמי", "psychodynamic"],
      ["סי בי טי", "cbt"],
      ["טיפול בסכמה", "schema-therapy"],
      ["טיפול מבוסס חמלה", "cft"],
      ["אי אם די אר", "emdr"],
      ["טיפול גוף נפש", "body-psychotherapy"],
      ["גישה מערכתית", "systemic-family"],
      ["טיפול דיאדי", "dyadic-parent-child"],
    ];

    for (const [query, slug] of cases) {
      const result = interpretQuery(query, catalog);
      expect(result.hardFilters.modalitySlugs, query).toContain(slug);
    }
  });
});

describe("production population language coverage", () => {
  it("defines aliases for all 8 canonical populations", () => {
    expect(Object.keys(CANONICAL_POPULATION_ALIASES).sort()).toEqual(
      CANONICAL_POPULATIONS.map((population) => population.slug).sort(),
    );
    for (const population of CANONICAL_POPULATIONS) {
      expect(populationAliasesFor(population.slug).length, population.slug).toBeGreaterThan(0);
    }
  });

  it("recognizes singular/plural and natural Hebrew population forms", () => {
    const catalog = productionCatalog();
    const cases: Array<[string, string]> = [
      ["פעוטה", "infants"],
      ["ילד", "children"],
      ["נערה", "adolescents"],
      ["מתבגר", "adolescents"],
      ["צעירה", "young-adults"],
      ["מבוגרת", "adults"],
      ["קשיש", "older-adults"],
      ["בני זוג", "couples"],
      ["הורים", "parents-families"],
    ];

    for (const [query, slug] of cases) {
      const result = interpretQuery(query, catalog);
      expect(result.hardFilters.populationSlugs, query).toContain(slug);
    }
  });

  it("contains no ambiguous normalized population phrase across different slugs", () => {
    const catalog = productionCatalog();
    expect(
      ambiguousPhrases(
        catalog.populations.map((population) => ({
          slug: population.slug,
          variants: [population.name_he, ...population.aliases],
        })),
      ),
    ).toEqual([]);
  });
});

describe("production language alias coverage", () => {
  it("covers all 8 supported language codes, including German and Amharic", () => {
    expect(Object.keys(HE_LANG_ALIASES).sort()).toEqual(
      ["am", "ar", "de", "en", "es", "fr", "he", "ru"].sort(),
    );

    const catalog = productionCatalog();
    const cases: Array<[string, string]> = [
      ["hebrew", "he"],
      ["english", "en"],
      ["arabic", "ar"],
      ["russian", "ru"],
      ["french", "fr"],
      ["spanish", "es"],
      ["german", "de"],
      ["amharic", "am"],
    ];

    for (const [query, code] of cases) {
      const result = interpretQuery(query, catalog);
      expect(result.hardFilters.languageCodes, query).toContain(code);
    }
  });
});
