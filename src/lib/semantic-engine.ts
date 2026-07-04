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

/**
 * Canonical scoring pipeline shared by classify() and extractProfile().
 * Returns raw problem-id → weighted score map (before normalization).
 */
function scoreAgainstVocabulary(text: string, vocab: Vocab): Map<string, number> {
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

/* ------------------------------------------------------------------ */
/* Public engine API                                                  */
/* ------------------------------------------------------------------ */

/**
 * Classify a user query into weighted problem candidates.
 * Preserves prior behavior: problem-name > alias > intent, saturation-scaled
 * confidence, top MAX_MATCHES results.
 */
async function classify(
  input: string,
  sb: SupabaseClient<Database>,
): Promise<SemanticResult[]> {
  const q = normalizeText(input);
  if (q.length < 2) return [];

  const vocab = await fetchVocabulary(sb);
  const scores = scoreAgainstVocabulary(q, vocab);
  if (scores.size === 0) return [];

  const values = Array.from(scores.values());
  const maxRaw = Math.max(...values);
  const total = values.reduce((a, b) => a + b, 0);
  const saturation = Math.min(1, total / 3);

  return Array.from(scores.entries())
    .map(([id, raw]) => {
      const slug = vocab.slugById.get(id);
      if (!slug) return null;
      const rel = raw / maxRaw;
      const confidence = Math.min(0.95, rel * saturation);
      return { slug, confidence: Number(confidence.toFixed(3)) };
    })
    .filter((m): m is SemanticResult => !!m)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_MATCHES);
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
  // Match against the ORIGINAL source (matchesText normalizes internally);
  // this preserves prior extractor behavior of not folding away multi-word
  // aliases at the input side.
  const scores = scoreAgainstVocabulary(source, vocab);
  if (scores.size === 0) return [];

  const max = Math.max(...scores.values());
  const entries: SemanticProfileEntry[] = [];
  for (const [id, s] of scores) {
    const slug = vocab.slugById.get(id);
    if (!slug) continue;
    entries.push({ slug, weight: Number((s / max).toFixed(3)) });
  }
  return entries.sort((a, b) => b.weight - a.weight);
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