/**
 * Phase Q1 v4 — pure ranking + preference scoring for the unified search
 * pipeline. DB-touching orchestration lives in
 * `query-interpreter.functions.ts`.
 *
 * Ranking is lexicographic (Tier A → D):
 *   A. semanticScore      (desc)
 *   B. preferenceScore    (desc, capped per category)
 *   C. qualityScore       (desc)
 *   D. yearsExperience    (desc)
 */

import type {
  CandidateForRanking,
  SemanticSignal,
  SoftPreferences,
} from "./query-interpreter.types";
import type { SemanticProfileEntry } from "./therapist-semantic-profile";

/**
 * Approved 0–7 preference model: each of the seven soft-preference
 * categories contributes AT MOST one point. Multiple matching values
 * inside one category still contribute exactly one point. There are no
 * category-specific weights.
 */
export const MAX_PREFERENCE_SCORE = 7;

export function computePreferenceScore(
  candidate: CandidateForRanking,
  soft: SoftPreferences,
): number {
  return (
    (soft.professionSlugs.some((s) => candidate.professionSlugs.includes(s)) ? 1 : 0) +
    (soft.modalitySlugs.some((s) => candidate.modalitySlugs.includes(s)) ? 1 : 0) +
    (soft.populationSlugs.some((s) => candidate.populationSlugs.includes(s)) ? 1 : 0) +
    (soft.languageCodes.some((c) => candidate.languageCodes.includes(c)) ? 1 : 0) +
    (soft.cities.some((c) => candidate.cities.includes(c)) ? 1 : 0) +
    (soft.deliveryModes.some((m) => candidate.deliveryModes.includes(m)) ? 1 : 0) +
    (candidate.gender && soft.genders.includes(candidate.gender) ? 1 : 0)
  );
}

export function computeSemanticScore(
  candidateSlugs: Set<string>,
  signals: SemanticSignal[],
): { score: number; overlapCount: number } {
  if (signals.length === 0) return { score: 0, overlapCount: 0 };
  let score = 0;
  let overlap = 0;
  for (const sig of signals) {
    if (candidateSlugs.has(sig.slug)) {
      score += sig.confidence;
      overlap += 1;
    }
  }
  return { score, overlapCount: overlap };
}

/**
 * Weighted semantic score used by the unified executor.
 *
 *   semanticScore = Σ over overlap slugs of
 *                     querySignal.confidence × profileEntry.weight
 *
 * `querySignal.confidence` is the canonical SemanticEngine.classify()
 * output — it already combines matcher weight, specificity, coverage
 * and calibration. `profileEntry.weight` is the therapist-side stored
 * weight from `parseStoredProfile`. Both sides contribute; neither is
 * multiplied twice.
 */
export function computeSemanticScoreWithProfile(
  profile: SemanticProfileEntry[],
  signals: SemanticSignal[],
): { score: number; overlapCount: number } {
  if (signals.length === 0 || profile.length === 0) {
    return { score: 0, overlapCount: 0 };
  }
  const byslug = new Map(profile.map((e) => [e.slug, e.weight]));
  let score = 0;
  let overlap = 0;
  for (const sig of signals) {
    const w = byslug.get(sig.slug);
    if (w !== undefined) {
      score += sig.confidence * w;
      overlap += 1;
    }
  }
  return { score, overlapCount: overlap };
}

export type RankedCandidate = CandidateForRanking & { preferenceScore: number };

export function rankCandidates(
  candidates: CandidateForRanking[],
  soft: SoftPreferences,
): RankedCandidate[] {
  const scored: RankedCandidate[] = candidates.map((c) => ({
    ...c,
    preferenceScore: computePreferenceScore(c, soft),
  }));
  scored.sort((a, b) => {
    if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
    if (b.preferenceScore !== a.preferenceScore) return b.preferenceScore - a.preferenceScore;
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    if (b.yearsExperience !== a.yearsExperience) return b.yearsExperience - a.yearsExperience;
    // Deterministic tiebreak so identical-score results are stable.
    return a.therapistId < b.therapistId ? -1 : a.therapistId > b.therapistId ? 1 : 0;
  });
  return scored;
}

export function applySemanticGate<T extends { semanticOverlap: number }>(
  candidates: T[],
  hasSignals: boolean,
): T[] {
  if (!hasSignals) return candidates;
  return candidates.filter((c) => c.semanticOverlap > 0);
}

/**
 * Non-experience quality signals. Experience appears exclusively in the
 * `yearsExperience` lexicographic ranking tier — never counted twice.
 * The `yearsExperience` field is accepted (and ignored) so existing
 * callers do not need to be rewritten in one pass.
 */
export function computeQualityScore(profile: {
  yearsExperience?: number;
  verified: boolean;
  hasImage: boolean;
  bioLength: number;
}): number {
  let score = 0;
  if (profile.verified) score += 5;
  if (profile.hasImage) score += 2;
  score += Math.min(profile.bioLength / 200, 5);
  return score;
}