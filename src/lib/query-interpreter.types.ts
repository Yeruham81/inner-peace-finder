/**
 * Phase Q1 v4 — pure types for the unified query interpreter and search planner.
 *
 * This module has NO runtime imports. It is safe to import from any layer
 * (pure business logic, orchestration, or UI) without pulling in Supabase,
 * React, TanStack Router or server-only code.
 */

export type Profession = {
  id: string;
  slug: string;
  name_he: string;
  /** All normalized name forms (masculine/feminine/plural/EN) used for matching. */
  nameVariants: string[];
  /** Subset of `nameVariants` that carry an explicit feminine form. */
  feminineVariants: string[];
};

export type Modality = {
  id: string;
  slug: string;
  name_he: string;
  nameVariants: string[];
};

export type PopulationEntry = {
  slug: string;
  name_he: string;
  aliases: string[];
};

export type LanguageEntry = {
  code: string;
  name_he: string;
  aliases: string[];
};

/** Canonical city stored in `therapist_locations.city` plus its normalized aliases. */
export type CityEntry = {
  canonical: string;
  aliases: string[];
};

export type TherapistNameEntry = {
  id: string;
  fullName: string;
  /** Normalized name tokens (lowercased, punctuation stripped). */
  tokens: string[];
};

export type Catalog = {
  professions: Profession[];
  modalities: Modality[];
  cities: CityEntry[];
  populations: PopulationEntry[];
  languages: LanguageEntry[];
  therapistNames: TherapistNameEntry[];
  /** Count of therapists sharing each first name — used to reject ambiguous
   *  first-name-only matches. */
  firstNameCount: Map<string, number>;
};

export type Intent = "structured" | "semantic" | "hybrid" | "named" | "unresolved_service" | "unknown";

export type UnresolvedCode = "unrecognized_service" | "gender_conflict" | "empty_query";

export type TherapistGender = "male" | "female";

export type StructuredFilters = {
  professionSlugs: string[];
  modalitySlugs: string[];
  populationSlugs: string[];
  languageCodes: string[];
  /** Canonical `location_type` enum values only. */
  deliveryModes: string[];
  /** Canonical city strings as stored in `therapist_locations.city`. */
  cityNames: string[];
  therapistGender: TherapistGender | null;
  /**
   * Canonical region slugs (see `locality-options`). Region and delivery
   * mode are correlated by the executor through ONE location-availability
   * operation — they are never two unrelated therapist-id intersections.
   */
  regionSlugs?: string[];
  therapyFormatSlugs?: string[];
  accessibleClinic?: boolean;
  verifiedOnly?: boolean;
  lgbtqAffirming?: boolean;
  freeIntroOnly?: boolean;
};

/** Explicit UI filters, already validated against the canonical catalog. */
export type ValidatedExplicitFilters = {
  cityNames: string[];
  populationSlugs: string[];
  languageCodes: string[];
  regionSlugs: string[];
  serviceTypes: string[];
  professionSlugs: string[];
  modalitySlugs: string[];
  therapyFormatSlugs: string[];
  therapistGender: TherapistGender | null;
  accessibleClinic: boolean;
  verifiedOnly: boolean;
  lgbtqAffirming: boolean;
  freeIntroOnly: boolean;
  /** Raw values that did not resolve to a canonical catalog entry. */
  rejected: Array<{ category: ExplicitFilterCategory; value: string }>;
};

export type ExplicitFilterCategory =
  | "city"
  | "population"
  | "language"
  | "region"
  | "serviceType"
  | "profession"
  | "modality"
  | "therapyFormat"
  | "gender"
  | "accessible"
  | "verified"
  | "lgbtqAffirming"
  | "freeIntro";

/** Recorded when an explicit UI filter overrode a query-inferred value. */
export type FilterConflict = {
  category: ExplicitFilterCategory;
  inferred: string[];
  explicit: string[];
};

export type SoftPreferences = {
  professionSlugs: string[];
  modalitySlugs: string[];
  populationSlugs: string[];
  languageCodes: string[];
  cities: string[];
  deliveryModes: string[];
  genders: TherapistGender[];
};

export type GenderEvidence = "explicit_female" | "explicit_male" | "feminine_profession_form";

export type InterpretationResult = {
  raw: string;
  normalized: string;
  intent: Intent;
  /** True when the primary intent slot is a recognized unsupported service phrase. */
  unresolvedPrimary: boolean;
  /** The recognized head phrase used to determine `intent` (or null when unknown). */
  primaryHead: string | null;
  hardFilters: StructuredFilters;
  softPreferences: SoftPreferences;
  therapistNameIds: string[];
  /** Remaining tokens after structured extraction — fed to SemanticEngine. */
  semanticRemainder: string;
  genderEvidence: GenderEvidence[];
  unresolvedCodes: UnresolvedCode[];
};

/** Semantic evidence for one classified domain, from SemanticEngine.classify. */
export type SemanticSignal = { slug: string; confidence: number };

/** Fully-typed search plan the executor consumes. */
export type TherapistSearchPlan = {
  interpretation: InterpretationResult;
  semanticSignals: SemanticSignal[];
  hardFilters: StructuredFilters;
  softPreferences: SoftPreferences;
  therapistNameIds: string[];
  /** Executor should short-circuit with this reason when set. */
  emptyReason: null | "unrecognized_query";
  /**
   * True when the request carried NO query text and NO explicit filters at
   * all: `/search` should browse the eligible published list rather than
   * report `unrecognized_query`.
   */
  browseAll?: boolean;
  /** Explicit UI filters folded into `hardFilters` (debug metadata). */
  explicitFilters?: ValidatedExplicitFilters | null;
  /** Explicit-vs-inferred conflicts, resolved in favor of the explicit value. */
  filterConflicts?: FilterConflict[];
};

/** Minimal candidate row shape used inside pure ranking / preference logic. */
export type CandidateForRanking = {
  therapistId: string;
  professionSlugs: string[];
  modalitySlugs: string[];
  populationSlugs: string[];
  languageCodes: string[];
  cities: string[];
  deliveryModes: string[];
  gender: TherapistGender | null;
  yearsExperience: number;
  qualityScore: number;
  /** Similarity vs. plan.semanticSignals — computed by executor before ranking. */
  semanticScore: number;
};
