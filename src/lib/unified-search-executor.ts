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
import type { TherapistGender, TherapistSearchPlan } from "./query-interpreter.types";
import type { CardClinicLocation, SearchResultCard } from "./search-result-card";

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

/**
 * Display payload for one result card. Sourced from the therapist record and
 * the ACTIVE `therapist_locations` / language relations — never from the
 * legacy `therapists.city` column, and never containing contact details.
 */
export type DisplayRow = {
  slug: string;
  full_name: string;
  professional_title: string | null;
  image_url: string | null;
  verified: boolean;
  short_intro: string | null;
  primary_clinic: CardClinicLocation | null;
  additional_clinic_count: number;
  online_available: boolean;
  home_visit_regions: string[];
  language_names: string[];
  population_names: string[];
  modality_names: string[];
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  /**
   * True when the therapist has active clinics but no `is_primary` marker,
   * so a deterministic read-only fallback picked the primary for display.
   */
  primary_clinic_fallback_used?: boolean;
};

/** Correlated location filter: region and service type on the SAME row. */
export type LocationAvailabilityFilter = {
  /** Canonical region slugs (OR within). */
  regionSlugs: string[];
  /** Canonical `location_type` values (OR within). */
  serviceTypes: string[];
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
  /**
   * Correlated region + service-type availability.
   *
   *  - physical types (clinic / home_visit) must match a single ACTIVE row
   *    whose region is one of the selected regions (when regions are given),
   *  - `online` is location-independent and never requires a regional row,
   *  - regions without service types match active clinic OR home_visit
   *    availability in those regions,
   *  - service types without regions match any active row of those types.
   */
  idsByLocationAvailability(filter: LocationAvailabilityFilter): Promise<Set<string>>;
  idsByGender(gender: TherapistGender): Promise<Set<string>>;
  idsByTherapyFormats?(slugs: string[]): Promise<Set<string>>;
  idsByProfileAttributes?(filter: {
    accessibleClinic: boolean;
    verifiedOnly: boolean;
    lgbtqAffirming: boolean;
    freeIntroOnly: boolean;
  }): Promise<Set<string>>;
  /** Full canonical hydration for ranking + preference scoring. */
  hydrate(ids: string[]): Promise<HydratedCandidate[]>;
  fetchDisplay(ids: string[]): Promise<Map<string, DisplayRow>>;
}

export type ExecutorResultRow = SearchResultCard;

export type ExecutorOutput = {
  results: ExecutorResultRow[];
  emptyReason: null | "unrecognized_query" | "no_matching_therapists";
  /** How many rendered cards relied on the primary-clinic display fallback. */
  primaryClinicFallbackCount: number;
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
    return { results: [], emptyReason: "unrecognized_query", primaryClinicFallbackCount: 0 };
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
  const regionSlugs = hf.regionSlugs ?? [];
  if (regionSlugs.length || hf.deliveryModes.length) {
    setsToIntersect.push(
      await repo.idsByLocationAvailability({
        regionSlugs,
        serviceTypes: hf.deliveryModes,
      }),
    );
  }
  if (hf.therapistGender) setsToIntersect.push(await repo.idsByGender(hf.therapistGender));
  if ((hf.therapyFormatSlugs?.length ?? 0) > 0) {
    if (!repo.idsByTherapyFormats) throw new Error("Therapy-format filtering is unavailable");
    setsToIntersect.push(await repo.idsByTherapyFormats(hf.therapyFormatSlugs ?? []));
  }
  if (hf.accessibleClinic || hf.verifiedOnly || hf.lgbtqAffirming || hf.freeIntroOnly) {
    if (!repo.idsByProfileAttributes) throw new Error("Profile-attribute filtering is unavailable");
    setsToIntersect.push(
      await repo.idsByProfileAttributes({
        accessibleClinic: Boolean(hf.accessibleClinic),
        verifiedOnly: Boolean(hf.verifiedOnly),
        lgbtqAffirming: Boolean(hf.lgbtqAffirming),
        freeIntroOnly: Boolean(hf.freeIntroOnly),
      }),
    );
  }

  const hasHardFilters = setsToIntersect.length > 0;

  // Unknown-query guard: nothing to anchor the search on — no names, no
  // hard filters, no semantic signals. The mere existence of leftover
  // remainder text is not itself evidence of intent. An EMPTY request
  // (`plan.browseAll`) is different: it browses the eligible list.
  if (!hasNames && !hasHardFilters && !hasSignals && !plan.browseAll) {
    return { results: [], emptyReason: "unrecognized_query", primaryClinicFallbackCount: 0 };
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
    return { results: [], emptyReason: "no_matching_therapists", primaryClinicFallbackCount: 0 };
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
    return { results: [], emptyReason: "no_matching_therapists", primaryClinicFallbackCount: 0 };
  }

  const display = await repo.fetchDisplay(top.map((r) => r.therapistId));

  // Preserve the executor's ranked order — the DB does not guarantee row
  // order for `IN (...)` queries, so we rebuild the array from the ranked
  // ids and skip any id the display map lost (e.g. failed eligibility
  // recheck at fetch time).
  const results: ExecutorResultRow[] = [];
  let primaryClinicFallbackCount = 0;
  for (const r of top) {
    const d = display.get(r.therapistId);
    if (!d) continue;
    if (d.primary_clinic_fallback_used) primaryClinicFallbackCount += 1;
    results.push({
      id: r.therapistId,
      slug: d.slug,
      full_name: d.full_name,
      professional_title: d.professional_title,
      image_url: d.image_url,
      verified: d.verified,
      years_experience: r.yearsExperience,
      short_intro: d.short_intro,
      primary_clinic: d.primary_clinic,
      additional_clinic_count: d.additional_clinic_count,
      online_available: d.online_available,
      home_visit_regions: d.home_visit_regions,
      language_names: d.language_names,
      population_names: d.population_names,
      modality_names: d.modality_names,
      lgbtq_affirming: d.lgbtq_affirming,
      offers_free_intro: d.offers_free_intro,
      scores: {
        semantic: r.semanticScore,
        preference: r.preferenceScore,
        quality: r.qualityScore,
      },
    });
  }

  return {
    results,
    emptyReason: results.length === 0 ? "no_matching_therapists" : null,
    primaryClinicFallbackCount,
  };
}

/**
 * Pure, deterministic evaluation of the correlated location filter against
 * one therapist's ACTIVE location rows. Shared by the Supabase repo and the
 * test doubles so both sides apply identical semantics.
 */
export function matchesLocationAvailability(
  rows: Array<{ location_type: string; region_slug: string | null }>,
  filter: LocationAvailabilityFilter,
  physicalTypes: readonly string[] = ["clinic", "home_visit"],
): boolean {
  const { regionSlugs, serviceTypes } = filter;
  if (regionSlugs.length === 0 && serviceTypes.length === 0) return true;

  const types = serviceTypes.length > 0 ? serviceTypes : [...physicalTypes];
  return rows.some((row) => {
    if (!types.includes(row.location_type)) return false;
    // Online availability is location-independent.
    if (!physicalTypes.includes(row.location_type)) return true;
    if (regionSlugs.length === 0) return true;
    return row.region_slug !== null && regionSlugs.includes(row.region_slug);
  });
}
