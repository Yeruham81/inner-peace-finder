/**
 * End-to-end validation of explicit treatment-domain recognition for the
 * therapist profile field `full_description` ("קצת עליי") against the
 * canonical 62-domain / 483-alias catalog approved on 2026-08-16.
 *
 * These tests drive the real production feedback path:
 * loadFeedbackCatalog -> findDirectEvidence / combineFeedbackDomains.
 * No network and no LLM call.
 */
import { describe, expect, it } from "bun:test";
import {
  combineFeedbackDomains,
  loadFeedbackCatalog,
  normalizeFeedbackText,
  type FeedbackDb,
} from "./profile-domain-feedback";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { LIVE_ACTIVE_CATALOG } from "./test-support/live-catalog-snapshot";

const CATALOG = LIVE_ACTIVE_CATALOG;

const domains = (text: string): string[] =>
  combineFeedbackDomains(text, CATALOG, []).map((d) => d.slug);

const slugById = new Map(CATALOG.problems.map((p) => [p.id, p.slug]));
const aliasesOf = (slug: string): string[] =>
  CATALOG.aliases.filter((a) => slugById.get(a.problem_id) === slug).map((a) => a.alias);
const nameOf = (slug: string): string => CATALOG.problems.find((p) => p.slug === slug)!.name_he;

const LEGACY_UMBRELLAS = new Set(["eating_body", "developmental", "neurodiversity"]);

describe("canonical treatment-domain snapshot", () => {
  it("contains exactly 62 active canonical domains and 483 aliases", () => {
    expect(CATALOG.problems).toHaveLength(62);
    expect(CATALOG.aliases).toHaveLength(483);
    expect(new Set(CATALOG.problems.map((p) => p.slug)).size).toBe(62);
    expect(new Set(CATALOG.aliases.map((a) => a.alias)).size).toBe(483);
  });

  it("contains no Legacy umbrella among the active domains", () => {
    for (const slug of LEGACY_UMBRELLAS) {
      expect(CATALOG.problems.some((p) => p.slug === slug)).toBe(false);
    }
  });

  it("contains the approved canonical split domains", () => {
    for (const [slug, name] of [
      ["adhd", "קשב, ADHD ותפקודים ניהוליים"],
      ["autism", "אוטיזם והספקטרום האוטיסטי"],
      ["childhood_development", "עיכובים וקשיים התפתחותיים"],
      ["burnout", "שחיקה ולחץ תעסוקתי"],
      ["career_direction", "בחירת קריירה ושינוי מקצועי"],
      ["eating_disorders", "הפרעות אכילה"],
      ["body_image", "דימוי גוף"],
      ["substance_use", "שימוש בחומרים והתמכרויות לחומרים"],
      ["behavioral_addiction", "התמכרויות התנהגותיות"],
    ] as const) {
      expect(nameOf(slug)).toBe(name);
    }
  });

  it("has no normalized alias collision across two different canonical domains", () => {
    const owners = new Map<string, Set<string>>();
    for (const a of CATALOG.aliases) {
      const slug = slugById.get(a.problem_id);
      expect(slug).toBeDefined();
      const key = normalizeFeedbackText(a.alias);
      const set = owners.get(key) ?? new Set<string>();
      set.add(slug!);
      owners.set(key, set);
    }
    expect([...owners.entries()].filter(([, slugs]) => slugs.size > 1)).toEqual([]);
  });

  it("covers every canonical domain with at least one alias", () => {
    for (const p of CATALOG.problems) {
      expect(aliasesOf(p.slug).length).toBeGreaterThan(0);
    }
  });

  it("loads through the production loader with exactly two queries", async () => {
    const db = createFakeSupabase({
      problems: CATALOG.problems.map((p) => ({ ...p, is_active: true })),
      problem_aliases: CATALOG.aliases.map((a) => ({
        problem_id: Number(a.problem_id),
        alias: a.alias,
      })),
    });

    const loaded = await loadFeedbackCatalog(db as unknown as FeedbackDb);

    expect(db.reads).toEqual(["problems", "problem_aliases"]);
    expect(loaded.problems).toHaveLength(62);
    expect(loaded.aliases).toHaveLength(483);
  });
});

describe("every canonical domain is reachable through approved direct evidence", () => {
  for (const problem of CATALOG.problems) {
    it(`${problem.slug} resolves from one of its approved aliases`, () => {
      const alias = aliasesOf(problem.slug)[0];
      expect(alias).toBeDefined();

      const out = domains(`תחום מרכזי בעבודתי הוא ${alias}.`);

      expect(out).toContain(problem.slug);
      expect(out.some((slug) => LEGACY_UMBRELLAS.has(slug))).toBe(false);
    });
  }
});

describe("the new split ontology remains distinct", () => {
  it("separates eating disorders from body image", () => {
    expect(domains("אני מטפלת בהפרעות אכילה ובדימוי גוף.").sort()).toEqual(
      ["body_image", "eating_disorders"].sort(),
    );
  });

  it("separates ADHD from autism", () => {
    expect(domains("אני מלווה אנשים עם ADHD ואוטיזם.").sort()).toEqual(["adhd", "autism"].sort());
  });

  it("separates burnout from career direction", () => {
    expect(domains("אני מטפל בשחיקה בעבודה ובבחירת קריירה.").sort()).toEqual(
      ["burnout", "career_direction"].sort(),
    );
  });

  it("separates substance use from behavioral addiction", () => {
    expect(domains("אני מטפל בשימוש באלכוהול ובהתנהגות ממכרת.").sort()).toEqual(
      ["behavioral_addiction", "substance_use"].sort(),
    );
  });

  it("distinguishes language, speech, fluency and voice domains", () => {
    expect(domains("אני מטפלת בקשיי שפה, קשיי היגוי, גמגום והפרעות קול.").sort()).toEqual(
      ["fluency_stuttering", "language_communication", "speech_articulation", "voice"].sort(),
    );
  });

  it("distinguishes rehabilitation domains", () => {
    expect(domains("אני עוסק בשיקום אורתופדי, שיקום נוירולוגי ושיקום לבבי.").sort()).toEqual(
      [
        "cardiopulmonary_rehabilitation",
        "neurological_rehabilitation",
        "orthopedic_rehabilitation",
      ].sort(),
    );
  });
});

describe("safety-first phrases are not deterministic treatment aliases", () => {
  const safetyFirst = [
    "אני שואל את עצמי למה לחיות",
    "אני חושב הרבה על החיים והמוות",
    "דופק מטורף",
    "קוצר נשימה פתאומי",
    "אין לי אוויר כבר",
    "אני עומדת להתפרק",
    "אני עומד להתפרק",
    "לא יכולה יותר",
    "לא יכול יותר",
  ];

  for (const phrase of safetyFirst) {
    it(`does not keep "${phrase}" in problem_aliases`, () => {
      expect(
        CATALOG.aliases.some(
          (a) => normalizeFeedbackText(a.alias) === normalizeFeedbackText(phrase),
        ),
      ).toBe(false);
    });
  }
});

describe("Legacy umbrellas never surface from current direct matching", () => {
  const examples = ["הפרעות אכילה ודימוי גוף", "ADHD ואוטיזם", "עיכוב התפתחותי"];

  for (const text of examples) {
    it(`${JSON.stringify(text)} returns only canonical slugs`, () => {
      expect(domains(text).some((slug) => LEGACY_UMBRELLAS.has(slug))).toBe(false);
    });
  }
});
