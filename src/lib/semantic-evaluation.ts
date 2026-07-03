/**
 * Semantic Evaluation Harness (Phase 10).
 *
 * Regression safety net for the semantic engine. Runs a fixed set of
 * Hebrew inputs through the engine's pure primitives (normalization +
 * flexible match) so any behavior change is caught before it can affect
 * production ranking.
 *
 * NOTE: this file intentionally does NOT hit the database — DB-backed
 * classification and extraction are covered by integration tests. The goal
 * here is to freeze the deterministic layer that everything else builds on.
 */

import { SemanticEngine } from "./semantic-engine";

export type NormalizationCase = {
  name: string;
  input: string;
  expected: string;
};

export type MatchCase = {
  name: string;
  phrase: string;
  haystack: string;
  expected: boolean;
};

export type ProfileMatchCase = {
  name: string;
  userProfile: Array<{ slug: string; confidence: number }>;
  therapistProfile: unknown;
  /** Expected similarity, matched with a small tolerance. */
  expected: number;
};

export type EvaluationCase =
  | ({ kind: "normalize" } & NormalizationCase)
  | ({ kind: "match" } & MatchCase)
  | ({ kind: "profile" } & ProfileMatchCase);

export type EvaluationResult = {
  name: string;
  kind: EvaluationCase["kind"];
  passed: boolean;
  detail?: string;
};

/* ---------------- fixtures ---------------- */

export const NORMALIZATION_CASES: NormalizationCase[] = [
  { name: "strip nikud",           input: "חֲרָדָה",           expected: "חרד" },
  { name: "collapse whitespace",   input: "  חרדה    חברתית ", expected: "חרד חברתי" },
  { name: "collapse repeated !",   input: "עזרה!!!!",           expected: "עזר" },
  { name: "collapse letter runs",  input: "לחוץץץץ",            expected: "לחוץ" },
  { name: "fem plural fold",       input: "התקפות חרדה",       expected: "התקפ חרד" },
  { name: "masc plural fold",      input: "לחצים בעבודה",       expected: "לחצ בעבוד" },
  { name: "lowercase latin",       input: "PTSD קשה",           expected: "ptsd קש" },
  { name: "empty",                 input: "",                    expected: "" },
];

export const MATCH_CASES: MatchCase[] = [
  { name: "direct alias",           phrase: "חרדה",         haystack: "יש לי חרדה חברתית", expected: true },
  { name: "prefix stripping",       phrase: "חרדה",         haystack: "בחרדה גדולה",       expected: true },
  { name: "plural variant",         phrase: "התקף חרדה",    haystack: "התקפי חרדה",       expected: true },
  { name: "paraphrase root",        phrase: "לחץ",          haystack: "אני לחוץ בעבודה",   expected: true },
  { name: "no overlap",             phrase: "חרדה",         haystack: "כאבי גב",           expected: false },
  { name: "stopword only",          phrase: "אני",          haystack: "אני עצוב",          expected: false },
  { name: "case-insensitive latin", phrase: "PTSD",         haystack: "ptsd אחרי צבא",     expected: true },
  { name: "empty phrase",           phrase: "",             haystack: "משהו",              expected: false },
];

export const PROFILE_CASES: ProfileMatchCase[] = [
  {
    name: "perfect overlap",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 1 }],
    expected: 1,
  },
  {
    name: "no overlap",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "couples", weight: 1 }],
    expected: 0,
  },
  {
    name: "partial weight",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 0.5 }],
    expected: 0.5,
  },
  {
    name: "legacy string profile normalised to weight 1",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: ["anxiety"],
    expected: 1,
  },
  {
    name: "empty therapist profile",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [],
    expected: 0,
  },
  {
    name: "empty user profile",
    userProfile: [],
    therapistProfile: [{ slug: "anxiety", weight: 1 }],
    expected: 0,
  },
  {
    name: "confidence-weighted average",
    userProfile: [
      { slug: "anxiety", confidence: 0.8 },
      { slug: "depression", confidence: 0.2 },
    ],
    therapistProfile: [{ slug: "anxiety", weight: 1 }],
    expected: 0.8,
  },
  {
    name: "malformed entries ignored",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 1 }, { foo: "bar" }, null],
    expected: 1,
  },
  {
    name: "weight clamped default when out of range",
    userProfile: [{ slug: "anxiety", confidence: 1 }],
    therapistProfile: [{ slug: "anxiety", weight: 999 }],
    expected: 1, // out-of-range → default 1.0
  },
];

export const ALL_CASES: EvaluationCase[] = [
  ...NORMALIZATION_CASES.map((c) => ({ kind: "normalize" as const, ...c })),
  ...MATCH_CASES.map((c) => ({ kind: "match" as const, ...c })),
  ...PROFILE_CASES.map((c) => ({ kind: "profile" as const, ...c })),
];

/* ---------------- runner ---------------- */

const TOLERANCE = 1e-3;

export function runEvaluation(cases: EvaluationCase[] = ALL_CASES): EvaluationResult[] {
  return cases.map((c) => {
    try {
      if (c.kind === "normalize") {
        const actual = SemanticEngine.normalizeText(c.input);
        return {
          name: c.name,
          kind: c.kind,
          passed: actual === c.expected,
          detail: actual === c.expected ? undefined : `got "${actual}", expected "${c.expected}"`,
        };
      }
      if (c.kind === "match") {
        const actual = SemanticEngine.matchesText(c.phrase, c.haystack);
        return {
          name: c.name,
          kind: c.kind,
          passed: actual === c.expected,
          detail: actual === c.expected ? undefined : `got ${actual}, expected ${c.expected}`,
        };
      }
      const actual = SemanticEngine.matchProfiles(c.userProfile, c.therapistProfile);
      const passed = Math.abs(actual - c.expected) <= TOLERANCE;
      return {
        name: c.name,
        kind: c.kind,
        passed,
        detail: passed ? undefined : `got ${actual}, expected ~${c.expected}`,
      };
    } catch (err) {
      return {
        name: c.name,
        kind: c.kind,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

export type EvaluationSummary = {
  total: number;
  passed: number;
  failed: number;
  results: EvaluationResult[];
};

export function summarizeEvaluation(results: EvaluationResult[]): EvaluationSummary {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, failed: results.length - passed, results };
}