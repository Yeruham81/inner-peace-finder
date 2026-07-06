/**
 * Semantic Evaluation Corpus (Phase 17A).
 *
 * Dedicated home for all deterministic evaluation fixtures. This file only
 * OWNS DATA — never behavior. The runner lives in `./semantic-evaluation.ts`.
 *
 * Two families of cases live here:
 *
 *   1. Primitive-layer cases (Phase 10) — normalization / matching / profile
 *      similarity. These freeze the deterministic building blocks of the
 *      engine and must not be modified.
 *
 *   2. Higher-level cases (Phase 17A) — query classification and therapist
 *      profile extraction. These share a common shape so the runner can be
 *      extended with new evaluators (LLM shadow mode, embeddings, hybrid)
 *      without touching the runner itself.
 *
 * NOTE: No new cases are added in Phase 17A. The higher-level arrays are
 * intentionally empty and will be populated in a later phase.
 */

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export type EvaluationCategory =
  | "direct"
  | "natural_language"
  | "ambiguous"
  | "multiple_domains"
  | "slang"
  | "typos"
  | "therapist_profile"
  // Primitive-layer categories (reporting only).
  | "primitive_normalize"
  | "primitive_match"
  | "primitive_profile";

/* ------------------------------------------------------------------ */
/* Higher-level case shape (classification + profile extraction)       */
/* ------------------------------------------------------------------ */

/**
 * Canonical shape for classification / profile-extraction cases.
 * `expected` is the ordered set of slugs the evaluator should surface;
 * ordering / thresholding policy is decided by the runner adapter.
 */
export type SemanticCase = {
  input: string;
  expected: string[];
  category?: EvaluationCategory;
  description?: string;
  notes?: string;
  /** When true, results below the confidence threshold are accepted. */
  allowLowConfidence?: boolean;
};

/**
 * Query-classification corpus. Grows in later phases.
 */
export const CLASSIFICATION_CASES: SemanticCase[] = [];

/**
 * Therapist profile-extraction corpus. Each `input` is a FULL_DESCRIPTION
 * that the engine's `extractProfile()` should reduce to the expected slug
 * set. Grows in later phases.
 */
export const PROFILE_EXTRACTION_CASES: SemanticCase[] = [];

/**
 * Convenience grouping so runners can iterate every higher-level corpus.
 */
export const ALL_HIGHER_LEVEL_CORPUSES: ReadonlyArray<{
  kind: "classify" | "extract-profile";
  cases: readonly SemanticCase[];
}> = [
  { kind: "classify", cases: CLASSIFICATION_CASES },
  { kind: "extract-profile", cases: PROFILE_EXTRACTION_CASES },
];

/* ------------------------------------------------------------------ */
/* Primitive-layer fixtures (Phase 10 — do not modify)                 */
/* ------------------------------------------------------------------ */

export type NormalizationCase = {
  name: string;
  input: string;
  expected: string;
  category?: EvaluationCategory;
};

export type MatchCase = {
  name: string;
  phrase: string;
  haystack: string;
  expected: boolean;
  category?: EvaluationCategory;
};

export type ProfileMatchCase = {
  name: string;
  userProfile: Array<{ slug: string; confidence: number }>;
  therapistProfile: unknown;
  /** Expected similarity, matched with a small tolerance. */
  expected: number;
  category?: EvaluationCategory;
};

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
