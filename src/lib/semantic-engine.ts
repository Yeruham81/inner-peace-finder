/**
 * Central Semantic Engine (Phases 13–16 — internalized).
 *
 * Single source of truth for all deterministic semantic logic:
 *   - normalization
 *   - lexical / alias / intent matching
 *   - user-query classification (weighted scoring + confidence)
 *   - therapist semantic profile extraction (SOT: full_description only)
 *   - profile similarity scoring
 *   - low-confidence resolution policy
 *
 * IMPORTANT (Phase 16 authority):
 *   Only this module may import `flexibleHebrewMatch` and other legacy
 *   matching internals from `./hebrew-normalizer`. All other modules must
 *   consume the SemanticEngine API exposed here.
 *
 * Behavioral parity: the classifier + extractor pipelines are identical
 *   normalize → lexical match → alias expansion → intent match →
 *   aggregate → confidence
 * so the deterministic engine can be later shadowed by an LLM adapter with
 * matching semantics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  flexibleHebrewMatch,
  lightNormalizeHebrew,
  tokenizeHebrew,
} from "./hebrew-normalizer";
import {
  parseStoredProfile,
  type SemanticProfileEntry,
} from "./therapist-semantic-profile";
import {
  DEPRECATED_SLUGS,
  PROFILE_ONLY_SLUGS,
  buildParentOf,
  isBlockedForClassify,
} from "./semantic-ontology";

export type { SemanticProfileEntry };

/** A classification result for a user query. */
export type SemanticResult = { slug: string; confidence: number };
export type UserMatch = SemanticResult;
export type SemanticProfile = SemanticProfileEntry[];

/* ------------------------------------------------------------------ */
/* Config                                                             */
/* ------------------------------------------------------------------ */

/** Weights per evidence type — preserved from the legacy classifier. */
const WEIGHT_PROBLEM_NAME = 3;
const WEIGHT_ALIAS = 2;
const WEIGHT_INTENT = 1;

/** Confidence policy — mirrors search-clarification thresholds. */
const CONFIDENCE_THRESHOLD = 0.65;
const DISAMBIGUATION_GAP = 0.12;
const MAX_MATCHES = 3;

/**
 * Public maximum number of accepted semantic matches. Exposed so any future
 * semantic provider (see `llm-semantic-contract`) enforces the SAME cap as
 * this deterministic engine instead of redefining it.
 */
export const SEMANTIC_MAX_MATCHES = MAX_MATCHES;

/* ------------------------------------------------------------------ */
/* Phase 17C.2 — scoring / confidence / suppression tunables          */
/* ------------------------------------------------------------------ */

/**
 * Specificity multiplier per evidence: a phrase with N whitespace tokens is
 * scored as `base * (1 + SPECIFICITY_SLOPE * (N-1))`. This rewards multi-
 * word alias / intent matches (which are inherently more specific) over
 * single-token generic anchors.
 */
const SPECIFICITY_SLOPE = 0.6;

/**
 * Only the top `EVIDENCE_CAP` per-slug evidences contribute to that slug's
 * total score. Prevents a slug with many overlapping generic aliases from
 * outranking a slug with fewer but more discriminating hits.
 */
const EVIDENCE_CAP = 3;

/** Confidence saturation constant. `s = score / (score + K)` — smaller K
 * saturates faster; K=5 puts a single 3-point name match at ~0.375. */
const CONFIDENCE_K = 5;

/** Confidence output range [MIN, MAX]. Compresses so that "no evidence"
 * and "perfect evidence" are distinguishable rather than both landing on
 * the previous saturated 0.95. */
const CONFIDENCE_MIN = 0.35;
const CONFIDENCE_MAX = 0.95;

/**
 * Deterministic child → parent map used by parent-suppression. A child that
 * outranks its parent in the candidate list suppresses the parent unless
 * the parent's score is high enough to indicate independent evidence.
 * Kept intentionally small and conservative to avoid recall regressions.
 */
const PARENT_OF: Record<string, string> = {
  panic: "anxiety",
  social_anxiety: "anxiety",
  health_anxiety: "anxiety",
  intrusive_thoughts: "ocd_compulsions",
  childhood_trauma: "trauma",
  ptsd: "trauma",
  body_image: "eating_body",
  low_mood: "depression",
};

/**
 * Phase 17C.4B: combined child → parent map. The engine's own PARENT_OF
 * stays intact for readability; ontology-driven additions are merged here
 * via `buildParentOf` so `applyParentSuppression` always sees one table.
 */
const PARENT_OF_EFFECTIVE = buildParentOf(PARENT_OF);

/**
 * If a child ranks above its parent AND the parent's raw score is below
 * `PARENT_SUPPRESS_RATIO * child.rawScore`, drop the parent. A parent that
 * still scores highly (>= ratio) is treated as independent evidence and
 * kept in the output.
 */
const PARENT_SUPPRESS_RATIO = 0.5;

/* ------------------------------------------------------------------ */
/* Extraction precision guards (semantic_profile only)                */
/* ------------------------------------------------------------------ */

/**
 * High-frequency generic Hebrew tokens that describe therapy/life in the
 * abstract but do NOT, on their own, constitute a treatment domain.
 * A single-token alias/name matching only one of these is dropped during
 * profile extraction so descriptions like "הבנה עצמית", "מצבי משבר",
 * "קשר טיפולי" cannot silently create domains such as
 * "דימוי עצמי נמוך", "משבר בזוגיות", "משבר זהות".
 *
 * Multi-word phrases containing these tokens are unaffected — e.g. the
 * alias "משבר בזוגיות" still fires from a therapist writing about it
 * explicitly.
 */
const EXTRACTION_GENERIC_ANCHORS: ReadonlySet<string> = new Set([
  "עצמי", "עצמית", "עצמו", "עצמה",
  "משבר", "משברים",
  "כאב", "כאבים",
  "חיים",
  "חברתי", "חברתית",
  "התפתחות", "התפתחותי",
  "זהות",
  "זוגי", "זוגית",
  "יחסים",
  "רגשי", "רגשית",
  "נפשי", "נפשית",
  "טיפול", "טיפולי", "טיפולית",
  "הבנה",
  "קשר",
  "צמיחה",
  "שינוי",
]);

/**
 * Minimum quality for a multi-token evidence to justify accepting a
 * treatment domain during profile extraction. Full-phrase substring hits
 * bypass this (quality = 1, full = true).
 */
const EXTRACTION_MIN_MULTI_TOKEN_QUALITY = 0.6;

/**
 * Absolute score floor for a slug to enter semantic_profile after
 * evidence aggregation. Prevents weak leftover evidence from surviving
 * the acceptance filter simply because its normalized ratio is high.
 */
const EXTRACTION_MIN_SCORE = 2.0;

/* ------------------------------------------------------------------ */
/* Primitive helpers (engine-internal only)                           */
/* ------------------------------------------------------------------ */

/**
 * Canonical normalization used everywhere before matching / caching.
 */
export function normalizeText(input: string): string {
  return lightNormalizeHebrew(input ?? "");
}

/** Boolean containment used by both the classifier and the extractor. */
export function matchesText(phrase: string, haystack: string): boolean {
  return flexibleHebrewMatch(phrase, haystack);
}

/** Token-level utility for advanced callers. */
export function tokenize(input: string): string[] {
  return tokenizeHebrew(input);
}

/** Safe parsing of any stored semantic_profile blob. */
export function parseProfile(raw: unknown): SemanticProfileEntry[] {
  return parseStoredProfile(raw);
}

/* ------------------------------------------------------------------ */
/* Shared vocabulary fetch + scoring pipeline                         */
/* ------------------------------------------------------------------ */

type VocabProblem = { id: string | number; slug: string; name: string | null };
type VocabAlias = { problem_id: string | number; alias: string };
type VocabIntent = { problem_slug: string | null; intent_text: string };
type Vocab = {
  problems: VocabProblem[];
  aliases: VocabAlias[];
  intents: VocabIntent[];
  slugById: Map<string, string>;
  idBySlug: Map<string, string>;
};

async function fetchVocabulary(sb: SupabaseClient<Database>): Promise<Vocab> {
  const [problemsRes, aliasesRes, intentsRes] = await Promise.all([
    sb.from("problems").select("id, slug, name:name_he"),
    sb.from("problem_aliases").select("problem_id, alias"),
    sb.from("problem_intents").select("problem_slug, intent_text"),
  ]);
  // A semantic catalog read failure must NEVER be silently degraded into
  // "no semantic signals" (which would surface as unrecognized_query or a
  // generic quality-ranked list). Propagate to the route error boundary.
  for (const res of [problemsRes, aliasesRes, intentsRes]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (res as any).error;
    if (err) throw err;
  }
  const problems = (problemsRes.data ?? []) as VocabProblem[];
  const aliases = (aliasesRes.data ?? []) as VocabAlias[];
  const intents = (intentsRes.data ?? []) as unknown as VocabIntent[];
  const slugById = new Map<string, string>();
  const idBySlug = new Map<string, string>();
  problems.forEach((p) => {
    slugById.set(String(p.id), p.slug);
    idBySlug.set(p.slug, String(p.id));
  });
  return { problems, aliases, intents, slugById, idBySlug };
}

/* ------------------------------------------------------------------ */
/* Canonical problem catalog (shared with future semantic providers)   */
/* ------------------------------------------------------------------ */

/** One canonical problem: the slug is the ONLY valid identifier. */
export type CanonicalProblemEntry = {
  slug: string;
  name: string;
  aliases: string[];
};

/**
 * Load the canonical problem catalog through the SAME read the classifier
 * uses, so no module ever hand-maintains a parallel slug list.
 *
 * Database errors propagate (Q1 behavior): a catalog read failure must never
 * degrade into a valid empty catalog.
 */
async function loadCanonicalProblems(
  sb: SupabaseClient<Database>,
): Promise<CanonicalProblemEntry[]> {
  const vocab = await fetchVocabulary(sb);
  const aliasesById = new Map<string, string[]>();
  for (const a of vocab.aliases) {
    const key = String(a.problem_id);
    const list = aliasesById.get(key) ?? [];
    list.push(a.alias);
    aliasesById.set(key, list);
  }
  return vocab.problems.map((p) => ({
    slug: p.slug,
    name: p.name ?? p.slug,
    aliases: aliasesById.get(String(p.id)) ?? [],
  }));
}

/**
 * Phase 17C.2: rich per-slug evidence. Each entry captures the matched
 * phrase, its evidence kind, and its token count. Downstream scoring
 * decides specificity weighting; kept separate from raw aggregation so
 * `classify()` and `extractProfile()` can share the same collection step
 * while diverging on aggregation policy later if needed.
 */
type Evidence = {
  kind: "name" | "alias" | "intent";
  base: number;
  phrase: string;
  tokens: number;
  /** 0..1 quality: how well the phrase actually maps onto the query. */
  quality: number;
  /** True if the entire normalized phrase appears verbatim in the query. */
  full: boolean;
  /**
   * True when the phrase's tokens appear in the query within a small
   * proximity window (see `hasProximityMatch`). Used to reject multi-
   * token evidence where tokens co-occur far apart (e.g. "משבר זהות"
   * matching "משברים שונים ועבודה על זהות"), which token-set overlap
   * alone cannot distinguish from a real phrase usage.
   */
  proximate: boolean;
};

function countTokens(phrase: string): number {
  const t = phrase.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/**
 * Quality score for an evidence phrase against the query. Uses the same
 * tokenizer as the matcher (stopwords + prefix folding), so it agrees with
 * `flexibleHebrewMatch` on what counts as a token, and computes:
 *
 *   - `full = true` when the entire normalized phrase appears verbatim
 *     (substring) inside the normalized query. Strongest signal.
 *   - `quality = overlap / max(1, phraseTokens)` otherwise. Reflects how
 *     much of the phrase's semantic content is actually present in the
 *     query — protects against the matcher firing on a single shared
 *     filler token.
 *
 * Returned `quality = 0` means the evidence should be dropped downstream.
 */
function scoreEvidenceQuality(
  phrase: string,
  nQuery: string,
  qTokenSet: Set<string>,
  qTokensOrdered: string[] = [],
): { quality: number; full: boolean; tokens: number; proximate: boolean } {
  const nPhrase = lightNormalizeHebrew(phrase);
  const pTokens = tokenizeHebrew(phrase);
  const tokenCount = pTokens.length || countTokens(phrase);
  if (nPhrase && nPhrase.length >= 2 && nQuery.includes(nPhrase)) {
    return { quality: 1, full: true, tokens: tokenCount, proximate: true };
  }
  if (pTokens.length === 0) {
    // Phrase tokenized to nothing (all stopwords / too-short). Trust the
    // matcher's original decision at a low but non-zero quality.
    return { quality: 0.4, full: false, tokens: tokenCount, proximate: false };
  }
  let overlap = 0;
  for (const t of pTokens) if (qTokenSet.has(t)) overlap++;
  // Also treat per-token substring overlap as a partial hit (mirrors
  // `flexibleHebrewMatch`'s fuzzier fallback for ≥4-char tokens). This
  // recovers typo cases like "דכאון" ↔ "דיכאון" where full-token equality
  // fails but the shared root is obvious.
  if (overlap === 0) {
    for (const t of pTokens) {
      if (t.length < 4) continue;
      for (const h of qTokenSet) {
        if (h.length >= 4 && (h.includes(t) || t.includes(h))) { overlap += 0.5; break; }
      }
    }
  }
  // Phase 17C.3 matcher-consistency: yod/vav-tolerant overlap. Mirrors
  // `flexibleHebrewMatch`'s secondary yv-fold pass so evidence quality
  // agrees with the matcher's decision on Israeli spelling variants
  // (e.g. "דיכאון" vs "דכאון", "לחוץ" vs "לחץ"). Weighted at 0.5 to keep
  // partial-typo evidence conservative.
  if (overlap === 0) {
    const stripYv = (s: string) => s.replace(/[יו]/g, "");
    for (const t of pTokens) {
      const tf = stripYv(t);
      if (tf.length < 3) continue;
      let hit = false;
      for (const h of qTokenSet) {
        const hf = stripYv(h);
        if (hf.length < 3) continue;
        if (tf === hf) { hit = true; break; }
        if (tf.length >= 4 && hf.length >= 4 && (hf.includes(tf) || tf.includes(hf))) { hit = true; break; }
      }
      if (hit) { overlap += 0.5; break; }
    }
  }
  const ratio = overlap / pTokens.length;
  // Never fully drop — instead weight by ratio² so partial matches count
  // only proportionally. This keeps recall (evidence isn't lost) while
  // sharply penalizing single-token filler overlaps.
  const quality = ratio > 0 ? Math.max(0.05, ratio * ratio) : 0;
  const proximate =
    pTokens.length <= 1
      ? true
      : hasProximityMatch(pTokens, qTokensOrdered);
  return { quality, full: false, tokens: tokenCount, proximate };
}

/**
 * True when every phrase token appears within a small sliding window of
 * the ordered query tokens — i.e. the tokens actually occur together, not
 * merely somewhere in the same text. Uses the same fuzzy equality rule as
 * `scoreEvidenceQuality`'s overlap fallback (≥4-char substring containment)
 * so it agrees with the matcher on Israeli spelling variants.
 *
 * Window size = `pTokens.length + 2`, allowing one or two intervening
 * stopwords/conjunctions ("של", "ו-", …) between the phrase's words.
 */
function hasProximityMatch(pTokens: string[], qTokens: string[]): boolean {
  if (pTokens.length === 0 || qTokens.length === 0) return false;
  const eq = (a: string, b: string): boolean => {
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
    return false;
  };
  const win = pTokens.length + 2;
  for (let i = 0; i < qTokens.length; i++) {
    const slice = qTokens.slice(i, i + win);
    if (slice.length < pTokens.length) break;
    const ok = pTokens.every((pt) => slice.some((qt) => eq(pt, qt)));
    if (ok) return true;
  }
  return false;
}

function collectEvidence(text: string, vocab: Vocab): Map<string, Evidence[]> {
  const byId = new Map<string, Evidence[]>();
  const nQuery = lightNormalizeHebrew(text);
  const qTokensOrdered = tokenizeHebrew(text);
  const qTokenSet = new Set(qTokensOrdered);
  const push = (id: string | number, ev: Evidence) => {
    if (ev.quality < 0.05) return;
    const key = String(id);
    const arr = byId.get(key) ?? [];
    arr.push(ev);
    byId.set(key, arr);
  };
  vocab.problems.forEach((p) => {
    if (p.name && matchesText(p.name, text)) {
      const q = scoreEvidenceQuality(p.name, nQuery, qTokenSet, qTokensOrdered);
      push(p.id, { kind: "name", base: WEIGHT_PROBLEM_NAME, phrase: p.name, ...q });
    }
  });
  vocab.aliases.forEach((a) => {
    if (a.alias && matchesText(a.alias, text)) {
      const q = scoreEvidenceQuality(a.alias, nQuery, qTokenSet, qTokensOrdered);
      push(a.problem_id, { kind: "alias", base: WEIGHT_ALIAS, phrase: a.alias, ...q });
    }
  });
  vocab.intents.forEach((i) => {
    if (!i.intent_text || !i.problem_slug) return;
    const pid = vocab.idBySlug.get(i.problem_slug);
    if (pid && matchesText(i.intent_text, text)) {
      const q = scoreEvidenceQuality(i.intent_text, nQuery, qTokenSet, qTokensOrdered);
      push(pid, { kind: "intent", base: WEIGHT_INTENT, phrase: i.intent_text, ...q });
    }
  });
  return byId;
}

/**
 * Phase 17C.4B — classification-only evidence collection.
 *
 * Differs from `collectEvidence` on two axes, both driven by the ontology
 * migration layer (never destructive to the DB):
 *
 *   1. Applies `BLOCKED_CLASSIFY_PHRASES` to skip specific aliases /
 *      intents that produce documented false positives at classify time.
 *      The rows remain fully available to `extractProfile()`.
 *
 *   2. Applies `DEPRECATED_SLUGS`: evidence collected against a deprecated
 *      slug is redirected into the canonical replacement slug's bucket
 *      (e.g. `burnout_depression` → `burnout`). The replacement slug's
 *      own evidence is then aggregated normally.
 *
 * Therapist profile extraction continues to use `collectEvidence` via
 * `scoreAgainstVocabularyLegacy` and is intentionally not affected.
 */
function collectEvidenceForClassify(text: string, vocab: Vocab): Map<string, Evidence[]> {
  const byId = new Map<string, Evidence[]>();
  const nQuery = lightNormalizeHebrew(text);
  const qTokensOrdered = tokenizeHebrew(text);
  const qTokenSet = new Set(qTokensOrdered);
  const resolveId = (rawId: string | number): string => {
    const key = String(rawId);
    const slug = vocab.slugById.get(key);
    if (!slug) return key;
    const replacement = DEPRECATED_SLUGS[slug];
    if (!replacement) return key;
    const mapped = vocab.idBySlug.get(replacement);
    return mapped ?? key;
  };
  const push = (rawId: string | number, ev: Evidence) => {
    if (ev.quality < 0.05) return;
    const key = resolveId(rawId);
    const arr = byId.get(key) ?? [];
    arr.push(ev);
    byId.set(key, arr);
  };
  vocab.problems.forEach((p) => {
    if (p.name && matchesText(p.name, text)) {
      const q = scoreEvidenceQuality(p.name, nQuery, qTokenSet, qTokensOrdered);
      push(p.id, { kind: "name", base: WEIGHT_PROBLEM_NAME, phrase: p.name, ...q });
    }
  });
  vocab.aliases.forEach((a) => {
    if (!a.alias || !matchesText(a.alias, text)) return;
    const srcSlug = vocab.slugById.get(String(a.problem_id));
    if (srcSlug && isBlockedForClassify(srcSlug, a.alias)) return;
    const q = scoreEvidenceQuality(a.alias, nQuery, qTokenSet, qTokensOrdered);
    push(a.problem_id, { kind: "alias", base: WEIGHT_ALIAS, phrase: a.alias, ...q });
  });
  vocab.intents.forEach((i) => {
    if (!i.intent_text || !i.problem_slug) return;
    if (isBlockedForClassify(i.problem_slug, i.intent_text)) return;
    const pid = vocab.idBySlug.get(i.problem_slug);
    if (pid && matchesText(i.intent_text, text)) {
      const q = scoreEvidenceQuality(i.intent_text, nQuery, qTokenSet, qTokensOrdered);
      push(pid, { kind: "intent", base: WEIGHT_INTENT, phrase: i.intent_text, ...q });
    }
  });
  return byId;
}

/** Specificity + quality weighted value of one evidence. */
function evidenceValue(ev: Evidence): number {
  const specificity = 1 + SPECIFICITY_SLOPE * Math.max(0, ev.tokens - 1);
  // Full-phrase substring matches are the strongest possible signal —
  // give them an additional multiplier so a slug whose ENTIRE alias
  // appears verbatim in the query dominates slugs matched via token
  // overlap only.
  const fullBonus = ev.full ? 1.6 : 1;
  return ev.base * specificity * ev.quality * fullBonus;
}

/**
 * Aggregate per-slug evidence into a single score. Sums the top
 * `EVIDENCE_CAP` specificity-weighted evidences, with light diminishing
 * returns on additional evidences beyond the top hit.
 */
function aggregateScore(evidences: Evidence[]): number {
  const values = evidences.map(evidenceValue).sort((a, b) => b - a);
  let score = 0;
  for (let i = 0; i < Math.min(values.length, EVIDENCE_CAP); i++) {
    // Slight decay to prevent piling identical low-specificity aliases.
    score += values[i] * (i === 0 ? 1 : 1 / (1 + i * 0.5));
  }
  return score;
}

/**
 * Legacy bump-count scoring kept intact for `extractProfile()` so therapist
 * profile extraction behavior is identical to the pre-17C.2 pipeline (that
 * regression suite is out of scope for this phase).
 */
function scoreAgainstVocabularyLegacy(text: string, vocab: Vocab): Map<string, number> {
  const raw = new Map<string, number>();
  const bump = (id: string | number, w: number) => {
    const key = String(id);
    raw.set(key, (raw.get(key) ?? 0) + w);
  };
  vocab.problems.forEach((p) => {
    if (p.name && matchesText(p.name, text)) bump(p.id, WEIGHT_PROBLEM_NAME);
  });
  vocab.aliases.forEach((a) => {
    if (a.alias && matchesText(a.alias, text)) bump(a.problem_id, WEIGHT_ALIAS);
  });
  vocab.intents.forEach((i) => {
    if (!i.intent_text || !i.problem_slug) return;
    const pid = vocab.idBySlug.get(i.problem_slug);
    if (pid && matchesText(i.intent_text, text)) bump(pid, WEIGHT_INTENT);
  });
  return raw;
}

/**
 * Evidence collection for `extractProfile()` — precision-first variant of
 * `collectEvidence`. Mirrors the classify-time protections and adds
 * extraction-specific safeguards documented in the module header:
 *
 *   1. `DEPRECATED_SLUGS` — evidence for a deprecated slug is redirected
 *      into its canonical replacement's bucket, matching classify().
 *   2. `BLOCKED_CLASSIFY_PHRASES` — the same alias/intent phrases that
 *      are documented as false positives at classify time are also
 *      unhelpful when tagging a therapist profile, so they are skipped.
 *   3. Intents (statements of user need) are omitted entirely. A
 *      therapist bio describes coverage; user-intent phrasing on the
 *      therapist side is not evidence of a treatment domain.
 *   4. Single-token evidence whose only token is a generic Hebrew
 *      anchor (`EXTRACTION_GENERIC_ANCHORS`) is dropped. Multi-word
 *      phrases that happen to contain such a token are kept.
 */
function collectEvidenceForExtract(text: string, vocab: Vocab): Map<string, Evidence[]> {
  const byId = new Map<string, Evidence[]>();
  const nQuery = lightNormalizeHebrew(text);
  const qTokensOrdered = tokenizeHebrew(text);
  const qTokenSet = new Set(qTokensOrdered);
  const resolveId = (rawId: string | number): string => {
    const key = String(rawId);
    const slug = vocab.slugById.get(key);
    if (!slug) return key;
    const replacement = DEPRECATED_SLUGS[slug];
    if (!replacement) return key;
    const mapped = vocab.idBySlug.get(replacement);
    return mapped ?? key;
  };
  const isGenericSingleToken = (phrase: string): boolean => {
    const toks = tokenizeHebrew(phrase);
    if (toks.length !== 1) return false;
    const raw = phrase.trim().split(/\s+/);
    if (raw.length !== 1) return false;
    return EXTRACTION_GENERIC_ANCHORS.has(raw[0]) || EXTRACTION_GENERIC_ANCHORS.has(toks[0]);
  };
  const push = (rawId: string | number, ev: Evidence) => {
    if (ev.quality < 0.05) return;
    const key = resolveId(rawId);
    const arr = byId.get(key) ?? [];
    arr.push(ev);
    byId.set(key, arr);
  };
  vocab.problems.forEach((p) => {
    if (!p.name) return;
    if (isGenericSingleToken(p.name)) return;
    if (!matchesText(p.name, text)) return;
    const q = scoreEvidenceQuality(p.name, nQuery, qTokenSet, qTokensOrdered);
    push(p.id, { kind: "name", base: WEIGHT_PROBLEM_NAME, phrase: p.name, ...q });
  });
  vocab.aliases.forEach((a) => {
    if (!a.alias) return;
    if (isGenericSingleToken(a.alias)) return;
    const srcSlug = vocab.slugById.get(String(a.problem_id));
    if (srcSlug && isBlockedForClassify(srcSlug, a.alias)) return;
    if (!matchesText(a.alias, text)) return;
    const q = scoreEvidenceQuality(a.alias, nQuery, qTokenSet, qTokensOrdered);
    push(a.problem_id, { kind: "alias", base: WEIGHT_ALIAS, phrase: a.alias, ...q });
  });
  // Intents intentionally skipped — see (3) above.
  return byId;
}

/**
 * True when a slug's aggregated evidence is strong enough to enter the
 * canonical semantic_profile. Requires at least one anchor:
 *   - a verbatim full-phrase match (name or alias), OR
 *   - a multi-token alias/name at ≥ EXTRACTION_MIN_MULTI_TOKEN_QUALITY.
 *   - CASE 1 (explicit exact treatment term): a single-token
 *     name/alias whose only meaningful token appears verbatim in the
 *     therapist text, is not part of `EXTRACTION_GENERIC_ANCHORS`, and
 *     is a real content word (length ≥ 3). This restores recall for
 *     explicit statements like "דיכאון", "חרדה", "טראומה", "אוטיזם"
 *     without re-enabling weak token overlap: generic anchors and
 *     partial multi-token overlaps are still rejected.
 * Weak single-token overlap on generic words never suffices.
 */
export function hasStrongExtractionEvidence(evidences: Evidence[]): boolean {
  for (const e of evidences) {
    if (e.kind === "intent") continue;
    if (e.full) return true;
    if (
      e.tokens >= 2 &&
      e.quality >= EXTRACTION_MIN_MULTI_TOKEN_QUALITY &&
      e.proximate
    ) {
      // Multi-token generic-anchor protection: reject when at least half
      // of the phrase's meaningful tokens are generic anchors. Such
      // phrases (e.g. "משבר זהות", "הצפה רגשית", "משבר זוגי") match too
      // easily on incidental co-occurrence of generic therapy words, so
      // they require a verbatim full-phrase hit (handled above via
      // `e.full`) instead of proximity+overlap.
      //
      // Compare against the raw whitespace-split tokens of the phrase
      // (not the stemmed tokens) because `EXTRACTION_GENERIC_ANCHORS`
      // is a set of surface Hebrew words ("משבר", "זהות", "רגשית", …),
      // while `tokenizeHebrew` may strip stopwords or fold suffixes
      // ("משבר זהות" → ["שבר"]) which would silently defeat the guard.
      const rawToks = e.phrase.trim().split(/\s+/).filter(Boolean);
      const anchors = rawToks.filter((t) => EXTRACTION_GENERIC_ANCHORS.has(t)).length;
      if (rawToks.length >= 2 && anchors * 2 < rawToks.length) return true;
      // else: anchor-heavy multi-token phrase → require `full` (skip).
    }
    // CASE 1 — explicit single-token treatment term. Restores recall
    // for statements like "טראומה", "דיכאון", "אוטיזם" without
    // re-enabling weak overlap: generic anchors are rejected (checked
    // both against the raw single-word phrase and its tokenized form,
    // since inflection folding may strip suffixes like "עצמי" → "עצם").
    if (e.tokens === 1 && e.quality >= 0.999) {
      const raw = e.phrase.trim().split(/\s+/);
      const toks = tokenizeHebrew(e.phrase);
      if (toks.length === 1) {
        const t = toks[0];
        const rawIsGeneric =
          raw.length === 1 && EXTRACTION_GENERIC_ANCHORS.has(raw[0]);
        const tokIsGeneric = EXTRACTION_GENERIC_ANCHORS.has(t);
        if (t.length >= 3 && !rawIsGeneric && !tokIsGeneric) return true;
      }
    }
  }
  return false;
}

/**
 * Parent suppression: if a child concept outranks its parent, and the
 * parent's raw score is dominated by the child's, drop the parent from
 * the output. Conservative — only suppresses when the parent is clearly
 * weaker than the child that already covers it.
 */
function applyParentSuppression(
  ranked: { slug: string; raw: number; confidence: number }[],
): { slug: string; raw: number; confidence: number }[] {
  const bySlug = new Map(ranked.map((r) => [r.slug, r]));
  const drop = new Set<string>();
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const parent = PARENT_OF_EFFECTIVE[r.slug];
    if (!parent) continue;
    const p = bySlug.get(parent);
    if (!p) continue;
    // Parent must appear later in the list (child ranks above parent).
    const pIdx = ranked.findIndex((x) => x.slug === parent);
    if (pIdx <= i) continue;
    if (p.raw < PARENT_SUPPRESS_RATIO * r.raw) drop.add(parent);
  }
  return ranked.filter((r) => !drop.has(r.slug));
}

/* ------------------------------------------------------------------ */
/* Public engine API                                                  */
/* ------------------------------------------------------------------ */

/**
 * Classify a user query into weighted problem candidates.
 *
 * Phase 17C.2 scoring pipeline:
 *   1. Collect evidence (name/alias/intent matches) per problem.
 *   2. Aggregate with specificity weighting + top-N cap.
 *   3. Calibrate confidence from raw score + query-coverage.
 *   4. Apply parent → child suppression conservatively.
 *   5. Return top MAX_MATCHES ordered by confidence.
 */
async function classify(
  input: string,
  sb: SupabaseClient<Database>,
): Promise<SemanticResult[]> {
  const q = normalizeText(input);
  if (q.length < 2) return [];

  const vocab = await fetchVocabulary(sb);
  const evidence = collectEvidenceForClassify(q, vocab);
  if (evidence.size === 0) return [];

  const queryTokens = Math.max(1, countTokens(q));
  const scored: { slug: string; raw: number; confidence: number }[] = [];
  for (const [id, list] of evidence) {
    const slug = vocab.slugById.get(id);
    if (!slug) continue;
    // Phase 17C.4B: umbrella / trait domains are excluded from classify
    // output. They remain available for extractProfile() (therapist
    // tagging) — see semantic-ontology.PROFILE_ONLY_SLUGS.
    if (PROFILE_ONLY_SLUGS.has(slug)) continue;
    const raw = aggregateScore(list);
    // Coverage: fraction of query tokens spanned by this slug's evidences
    // (approximate — sum of matched-phrase tokens, capped at queryTokens).
    const matchedTokens = list.reduce((a, e) => a + e.tokens, 0);
    const coverage = Math.min(1, matchedTokens / queryTokens);
    const s = raw / (raw + CONFIDENCE_K); // 0..1
    const conf = CONFIDENCE_MIN + (CONFIDENCE_MAX - CONFIDENCE_MIN) * s * (0.5 + 0.5 * coverage);
    scored.push({ slug, raw, confidence: Number(conf.toFixed(3)) });
  }

  scored.sort((a, b) => b.raw - a.raw || b.confidence - a.confidence);
  const suppressed = applyParentSuppression(scored);
  return suppressed.slice(0, MAX_MATCHES).map((r) => ({ slug: r.slug, confidence: r.confidence }));
}

/**
 * Extract a semantic profile from a therapist's `full_description`.
 * SOT policy: `full_description` is the only input; empty → [].
 *
 * Uses the SAME pipeline as `classify()` — normalize + lexical/alias/intent
 * match + aggregate — so extraction and classification are deterministically
 * aligned (Phase 16 unification).
 */
async function extractProfile(
  fullDescription: string | null | undefined,
  sb: SupabaseClient<Database>,
): Promise<SemanticProfile> {
  const source = (fullDescription ?? "").trim();
  const normalized = normalizeText(source);
  if (normalized.length < 20) return [];

  const vocab = await fetchVocabulary(sb);
  // Precision-first pipeline (see collectEvidenceForExtract +
  // hasStrongExtractionEvidence). Reuses the same evidence / aggregation
  // primitives as classify() so scoring is consistent, then applies
  // extraction-specific acceptance so semantic_profile represents
  // "domains the therapist describes working with" — not "topics the
  // text could be associated with".
  const evidenceMap = collectEvidenceForExtract(source, vocab);
  if (evidenceMap.size === 0) return [];

  const scored: { slug: string; score: number }[] = [];
  for (const [id, list] of evidenceMap) {
    const slug = vocab.slugById.get(id);
    if (!slug) continue;
    if (!hasStrongExtractionEvidence(list)) continue;
    const score = aggregateScore(list);
    if (score < EXTRACTION_MIN_SCORE) continue;
    scored.push({ slug, score });
  }
  if (scored.length === 0) return [];

  const max = Math.max(...scored.map((s) => s.score));
  return scored
    .map((s) => ({ slug: s.slug, weight: Number((s.score / max).toFixed(3)) }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Weighted overlap between user classification candidates and a therapist's
 * semantic profile. Returns 0..1.
 *
 *   sim = Σ (userConfidence[slug] * therapistWeight[slug]) / Σ userConfidence
 *
 * Tolerates any stored-profile shape via `parseStoredProfile`.
 */
function scoreProfiles(userMatches: UserMatch[], therapistProfile: unknown): number {
  const profile = parseStoredProfile(therapistProfile);
  if (!userMatches?.length || !profile.length) return 0;
  const tByslug = new Map(profile.map((e) => [e.slug, e.weight]));
  let num = 0;
  let den = 0;
  for (const m of userMatches) {
    den += m.confidence;
    const w = tByslug.get(m.slug);
    if (w !== undefined) num += m.confidence * w;
  }
  if (den === 0) return 0;
  return Number((num / den).toFixed(4));
}

export type LowConfidenceAction = "proceed" | "disambiguate" | "clarify" | "abstain";

/**
 * Confidence policy — decide what the pipeline should do given the top
 * classification candidates. Pure / side-effect free.
 */
export function resolveLowConfidence(results: SemanticResult[]): LowConfidenceAction {
  if (!results || results.length === 0) return "abstain";
  const top = results[0]?.confidence ?? 0;
  if (top < CONFIDENCE_THRESHOLD) return "clarify";
  const second = results[1]?.confidence ?? 0;
  if (results.length >= 2 && top - second < DISAMBIGUATION_GAP) return "disambiguate";
  return "proceed";
}

/* ------------------------------------------------------------------ */
/* Back-compat aliases (deprecated names still used by evaluation)    */
/* ------------------------------------------------------------------ */

/** @deprecated use `SemanticEngine.extractProfile`. */
export function extractDomains(
  fullDescription: string | null | undefined,
  sb: SupabaseClient<Database>,
): Promise<SemanticProfile> {
  return extractProfile(fullDescription, sb);
}

/** @deprecated use `SemanticEngine.scoreProfiles`. */
export function matchProfiles(userProfile: UserMatch[], therapistProfile: unknown): number {
  return scoreProfiles(userProfile, therapistProfile);
}

/* ------------------------------------------------------------------ */
/* Namespace export                                                   */
/* ------------------------------------------------------------------ */

export const SemanticEngine = {
  // canonical API (Phase 13)
  normalize: normalizeText,
  classify,
  extractProfile,
  scoreProfiles,
  resolveLowConfidence,
  // primitives / utilities
  normalizeText,
  matchesText,
  tokenize,
  extractDomains,   // deprecated alias
  matchProfiles,    // deprecated alias
  parseProfile,
} as const;

export type SemanticEngineType = typeof SemanticEngine;