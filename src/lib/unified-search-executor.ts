/**
 * Phase Q1 — deterministic unified-search executor.
 *
 * Pure module. Depends only on `unified-search` (ranking), the
 * `TherapistSearchPlan` types, and the canonical semantic-profile
 * parser. It has NO Supabase, React, TanStack, or server-function
 * dependency, so it can be unit-tested against an in-memory
 * `TherapistRepo` while remaining the same code path production hits.
 *
 * The production Supabase adapter lives next to the orchestrator in
 * `query-interpreter.functions.ts`.
 */

import {
  applySemanticGate,
  computeQualityScore,
  computeSemanticScoreWithProfile,
  rankCandidates,
  type RankedCandidate,
} from "./unified-search";
import type { SemanticProfileEntry } from "./therapist-semantic-profile";
import type {
  TherapistGender,
  TherapistSearchPlan,
} from "./query-interpreter.types";

export type DeliveryMode = "clinic" | "home_visit" | "online" | "hospital" | "other";

export type CanonicalQualitySignals = {
  verified: boolean;
  hasImage: boolean;
  bioLength: number;
};

/**
 * The hydrated candidate shape used by the executor. Every soft-preference
 * dimension (profession, modality, population, language, city, delivery
 * mode, gender) is present so `computePreferenceScore` can evaluate all of
 * them. Uses canonical identifiers already produced by the interpreter /
 * `TherapistSearchPlan`.
 */
export type HydratedCandidate = {
  id: string;
  gender: TherapistGender | null;
  professionSlugs: string[];
  modalitySlugs: string[];
  populationSlugs: string[];
  languageCodes: string[];
  cities: string[];
  deliveryModes: string[];
  semanticProfile: SemanticProfileEntry[];
  qualitySignals: CanonicalQualitySignals;
  yearsExperience: number;
};

export type DisplayRow = {
  slug: string;
  full_name: string;
  professional_title: string | null;
  image_url: string | null;
  city: string | null;
  verified: boolean;
};

/**
 * Repository seam. The production impl is a thin Supabase wrapper; tests
 * inject a fixture impl. All queries MUST throw on data-access failure so
 * the executor never confuses "read failed" with "no results".
 */
export interface TherapistRepo {
  /** Set of therapist ids that satisfy the invariant public eligibility. */
  loadEligibleIds(): Promise<Set<string>>;
  idsByProfessions(slugs: string[]): Promise<Set<string>>;
  idsByModalities(slugs: string[]): Promise<Set<string>>;
  idsByPopulations(slugs: string[]): Promise<Set<string>>;
  idsByLanguages(codes: string[]): Promise<Set<string>>;
  idsByCities(cities: string[]): Promise<Set<string>>;
  idsByDeliveryModes(modes: string[]): Promise<Set<string>>;
  idsByGender(gender: TherapistGender): Promise<Set<string>>;
  /** Full canonical hydration for ranking + preference scoring. */
  hydrate(ids: string[]): Promise<HydratedCandidate[]>;
  fetchDisplay(ids: string[]): Promise<Map<string, DisplayRow>>;
}

export type ExecutorResultRow = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  image_url: string | null;
  city: string | null;
  verified: boolean;
  semanticScore: number;
  preferenceScore: number;
  qualityScore: number;
  yearsExperience: number;
};

export type ExecutorOutput = {
  results: ExecutorResultRow[];
  emptyReason: null | "unrecognized_query" | "no_matching_therapists";
};

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<string>();
  for (const id of small) if (big.has(id)) out.add(id);
  return out;
}

/**
 * Deterministic executor. Given a validated plan and a repo, produce the
 * final ranked result rows.
 *
 * OR-within a category, AND-across categories, at the therapist-id level.
 * `location_type` and `city` are queried in separate category sets and
 * then intersected, so a therapist with an online row and a Haifa row
 * satisfies "online in Haifa".
 */
export async function executeUnifiedSearch(
  repo: TherapistRepo,
  plan: TherapistSearchPlan,
  limit = 20,
): Promise<ExecutorOutput> {
  if (plan.emptyReason === "unrecognized_query") {
    return { results: [], emptyReason: "unrecognized_query" };
  }

  const hf = plan.hardFilters;
  const hasNames = plan.therapistNameIds.length > 0;
  const hasSignals = plan.semanticSignals.length > 0;

  // Load eligibility exactly once per request.
  const eligible = await repo.loadEligibleIds();

  // Build one id-set per non-empty hard-filter category. Each call runs
  // one DB query using IN(...) for OR-within semantics.
  const setsToIntersect: Set<string>[] = [];
  if (hf.professionSlugs.length) setsToIntersect.push(await repo.idsByProfessions(hf.professionSlugs));
  if (hf.modalitySlugs.length) setsToIntersect.push(await repo.idsByModalities(hf.modalitySlugs));
  if (hf.populationSlugs.length) setsToIntersect.push(await repo.idsByPopulations(hf.populationSlugs));
  if (hf.languageCodes.length) setsToIntersect.push(await repo.idsByLanguages(hf.languageCodes));
  if (hf.cityNames.length) setsToIntersect.push(await repo.idsByCities(hf.cityNames));
  if (hf.deliveryModes.length) setsToIntersect.push(await repo.idsByDeliveryModes(hf.deliveryModes));
  if (hf.therapistGender) setsToIntersect.push(await repo.idsByGender(hf.therapistGender));

  const hasHardFilters = setsToIntersect.length > 0;

  // Unknown-query guard: nothing to anchor the search on — no names, no
  // hard filters, no semantic signals. The mere existence of leftover
  // remainder text is not itself evidence of intent.
  if (!hasNames && !hasHardFilters && !hasSignals) {
    return { results: [], emptyReason: "unrecognized_query" };
  }

  // Seed. Names, when present, define the initial candidate universe and
  // are then intersected with every hard filter. Otherwise the seed is
  // the full eligible set (used for semantic-only searches). No arbitrary
  // truncation.
  let seed: Set<string> = hasNames
    ? new Set(plan.therapistNameIds.filter((id) => eligible.has(id)))
    : new Set(eligible);

  for (const s of setsToIntersect) {
    seed = intersect(seed, s);
    if (seed.size === 0) break;
  }

  if (seed.size === 0) {
    return { results: [], emptyReason: "no_matching_therapists" };
  }

  const candidates = await repo.hydrate([...seed]);

  const scoredForRanking = candidates.map((c) => {
    const sem = computeSemanticScoreWithProfile(c.semanticProfile, plan.semanticSignals);
    return {
      therapistId: c.id,
      professionSlugs: c.professionSlugs,
      modalitySlugs: c.modalitySlugs,
      populationSlugs: c.populationSlugs,
      languageCodes: c.languageCodes,
      cities: c.cities,
      deliveryModes: c.deliveryModes,
      gender: c.gender,
      yearsExperience: c.yearsExperience,
      qualityScore: computeQualityScore(c.qualitySignals),
      semanticScore: sem.score,
      semanticOverlap: sem.overlapCount,
    };
  });

  const gated = applySemanticGate(scoredForRanking, hasSignals);
  const ranked: RankedCandidate[] = rankCandidates(gated, plan.softPreferences);
  const top = ranked.slice(0, limit);
  if (top.length === 0) {
    return { results: [], emptyReason: "no_matching_therapists" };
  }

  const display = await repo.fetchDisplay(top.map((r) => r.therapistId));

  // Preserve the executor's ranked order — the DB does not guarantee row
  // order for `IN (...)` queries, so we rebuild the array from the ranked
  // ids and skip any id the display map lost (e.g. failed eligibility
  // recheck at fetch time).
  const results: ExecutorResultRow[] = [];
  for (const r of top) {
    const d = display.get(r.therapistId);
    if (!d) continue;
    results.push({
      id: r.therapistId,
      slug: d.slug,
      full_name: d.full_name,
      professional_title: d.professional_title,
      image_url: d.image_url,
      city: d.city,
      verified: d.verified,
      semanticScore: r.semanticScore,
      preferenceScore: r.preferenceScore,
      qualityScore: r.qualityScore,
      yearsExperience: r.yearsExperience,
    });
  }

  return {
    results,
    emptyReason: results.length === 0 ? "no_matching_therapists" : null,
  };
}