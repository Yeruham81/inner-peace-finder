/**
 * End-to-end audit of therapist-side semantic extraction.
 *
 * This test exercises the REAL stored-profile path:
 *   full_description -> SemanticEngine.extractProfile() -> [{ slug, weight }]
 *
 * It deliberately uses the canonical 62-domain / 483-alias snapshot and the
 * existing in-memory Supabase test adapter, so it performs no network calls and
 * makes no production writes.
 *
 * Goals:
 *   1. Every canonical treatment-domain name is extractable.
 *   2. For every catalog alias, editor explicit-feedback and stored extraction
 *      agree on whether that alias is profile evidence for its target slug.
 *   3. A profile can retain more than eight independently stated domains.
 *   4. Profession / population / modality / location / generic wording does not
 *      create treatment domains by itself.
 */

import { describe, expect, it } from "bun:test";

import { SemanticEngine } from "./semantic-engine";
import { combineFeedbackDomains } from "./profile-domain-feedback";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { LIVE_ACTIVE_CATALOG } from "./test-support/live-catalog-snapshot";

type ExtractClient = Parameters<typeof SemanticEngine.extractProfile>[1];

const CATALOG = LIVE_ACTIVE_CATALOG;
const slugById = new Map(CATALOG.problems.map((problem) => [String(problem.id), problem.slug]));
const problemBySlug = new Map(CATALOG.problems.map((problem) => [problem.slug, problem]));

/**
 * SemanticEngine's fake-Supabase fixtures use `name` because the production
 * query selects `name:name_he`.
 * Intents are intentionally empty: therapist-profile extraction explicitly
 * ignores user-intent rows, and this audit is about canonical names + aliases.
 */
const sb = createFakeSupabase({
  problems: CATALOG.problems.map((problem) => ({
    id: problem.id,
    slug: problem.slug,
    name: problem.name_he,
    is_active: true,
  })),
  problem_aliases: CATALOG.aliases.map((alias) => ({ ...alias })),
  problem_intents: [],
}) as unknown as ExtractClient;

function auditDescription(phrase: string): string {
  return `בתיאור המקצועי שלי אני מציין במפורש: ${phrase}. זהו תחום שבו אני מטפל ובו צברתי ניסיון מקצועי.`;
}

async function extractedSlugs(description: string): Promise<string[]> {
  return (await SemanticEngine.extractProfile(description, sb)).map((entry) => entry.slug);
}

function feedbackSlugs(description: string): string[] {
  // Empty semantic input isolates the editor's strict direct-evidence path.
  return combineFeedbackDomains(description, CATALOG, []).map((entry) => entry.slug);
}

function formatFailure(args: {
  target: string;
  phrase: string;
  feedbackHas?: boolean;
  extractorHas?: boolean;
  extracted?: string[];
}): string {
  const parts = [`${args.target} <- ${JSON.stringify(args.phrase)}`];
  if (args.feedbackHas !== undefined) parts.push(`feedback=${args.feedbackHas}`);
  if (args.extractorHas !== undefined) parts.push(`extractor=${args.extractorHas}`);
  if (args.extracted) parts.push(`got=[${args.extracted.join(", ")}]`);
  return parts.join(" | ");
}

describe("therapist semantic extraction — canonical 62-domain / 483-alias E2E", () => {
  it("uses the approved canonical snapshot", () => {
    expect(CATALOG.problems).toHaveLength(62);
    expect(CATALOG.aliases).toHaveLength(483);
    expect(new Set(CATALOG.problems.map((problem) => problem.slug)).size).toBe(62);
    expect(new Set(CATALOG.aliases.map((alias) => alias.alias)).size).toBe(483);
  });

  it("extracts every one of the 62 canonical treatment-domain names", async () => {
    const failures: string[] = [];

    for (const problem of CATALOG.problems) {
      const description = auditDescription(problem.name_he);
      const extracted = await extractedSlugs(description);

      if (!extracted.includes(problem.slug)) {
        failures.push(
          formatFailure({
            target: problem.slug,
            phrase: problem.name_he,
            extracted,
          }),
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps editor feedback and stored extraction aligned across all 483 aliases", async () => {
    const failures: string[] = [];

    for (const alias of CATALOG.aliases) {
      const target = slugById.get(String(alias.problem_id));
      if (!target) {
        failures.push(`orphan alias ${JSON.stringify(alias.alias)} -> problem_id=${alias.problem_id}`);
        continue;
      }

      const description = auditDescription(alias.alias);
      const directFeedback = feedbackSlugs(description);
      const extracted = await extractedSlugs(description);
      const feedbackHas = directFeedback.includes(target);
      const extractorHas = extracted.includes(target);

      // This is intentionally bidirectional. A phrase shown in the editor but
      // absent from semantic_profile is misleading; a phrase silently stored in
      // semantic_profile while the editor refuses to show it is also a mismatch.
      if (feedbackHas !== extractorHas) {
        failures.push(
          formatFailure({
            target,
            phrase: alias.alias,
            feedbackHas,
            extractorHas,
            extracted,
          }),
        );
      }
    }

    expect(failures).toEqual([]);
    // 483 aliases x full extraction is CPU-bound and exceeds Bun's 5s default.
  }, 120_000);

  it("retains more than eight independently stated treatment domains", async () => {
    const selectedSlugs = [
      "depression",
      "adhd",
      "autism",
      "sleep_difficulties",
      "eating_disorders",
      "body_image",
      "breastfeeding_lactation",
      "fertility_journey",
      "burnout",
      "chronic_pain",
    ] as const;

    const phrases = selectedSlugs.map((slug) => {
      const problem = problemBySlug.get(slug);
      if (!problem) throw new Error(`Test fixture is missing canonical slug: ${slug}`);
      return problem.name_he;
    });

    const description = `אני מטפל בתחומים הבאים באופן מפורש: ${phrases.join("; ")}. בכל אחד מהתחומים האלה צברתי ניסיון מקצועי.`;
    const profile = await SemanticEngine.extractProfile(description, sb);
    const extracted = profile.map((entry) => entry.slug);

    const missing = selectedSlugs.filter((slug) => !extracted.includes(slug));
    expect(missing).toEqual([]);
    expect(new Set(extracted).size).toBe(extracted.length);
    expect(extracted.length).toBeGreaterThanOrEqual(selectedSlugs.length);

    for (const entry of profile) {
      expect(Number.isFinite(entry.weight)).toBe(true);
      expect(entry.weight).toBeGreaterThan(0);
      expect(entry.weight).toBeLessThanOrEqual(1);
    }
  });

  it("does not infer domains from profession, population, modality, location or generic wording alone", async () => {
    const negatives = [
      "אני פסיכולוגית קלינית ועובדת עם מבוגרים ומתבגרים בחדרה. אני משלבת CBT, ACT, MBSR ומיינדפולנס ועובדת בקליניקה פרטית.",
      "אני מטפל רגשי ועובד עם הורים ומשפחות. אבל אני לא מגדיר את העבודה לפי אבחנות. אני משלב טיפול דינמי ו-CBT ועובד באזור השרון.",
      "אני מלווה אנשים בתהליכי שינוי, התפתחות אישית והתמודדות רגשית. העבודה מותאמת לכל אדם ולצרכים שלו ונעשית בקצב שמתאים לו.",
    ];

    const failures: string[] = [];
    for (const description of negatives) {
      const extracted = await extractedSlugs(description);
      if (extracted.length > 0) {
        failures.push(`${JSON.stringify(description)} -> [${extracted.join(", ")}]`);
      }
    }

    expect(failures).toEqual([]);
  });
});
