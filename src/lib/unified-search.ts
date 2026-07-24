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

const PREF_CAPS = {
  profession: 2,
  modality: 2,
  population: 1,
  language: 0.5,
  city: 1,
  delivery: 0.5,
  gender: 1,
} as const;

export function computePreferenceScore(
  candidate: CandidateForRanking,
  soft: SoftPreferences,
): number {
  let score = 0;
  if (soft.professionSlugs.some((s) => candidate.professionSlugs.includes(s))) score += PREF_CAPS.profession;
  if (soft.modalitySlugs.some((s) => candidate.modalitySlugs.includes(s))) score += PREF_CAPS.modality;
  if (soft.populationSlugs.some((s) => candidate.populationSlugs.includes(s))) score += PREF_CAPS.population;
  if (soft.languageCodes.some((c) => candidate.languageCodes.includes(c))) score += PREF_CAPS.language;
  if (soft.cities.some((c) => candidate.cities.includes(c))) score += PREF_CAPS.city;
  if (soft.deliveryModes.some((m) => candidate.deliveryModes.includes(m))) score += PREF_CAPS.delivery;
  if (candidate.gender && soft.genders.includes(candidate.gender)) score += PREF_CAPS.gender;
  return score;
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
    return b.yearsExperience - a.yearsExperience;
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

export function computeQualityScore(profile: {
  yearsExperience: number;
  verified: boolean;
  hasImage: boolean;
  bioLength: number;
}): number {
  let score = 0;
  score += Math.min(profile.yearsExperience, 25) * 0.5;
  if (profile.verified) score += 5;
  if (profile.hasImage) score += 2;
  score += Math.min(profile.bioLength / 200, 5);
  return score;
}