/**
 * Phase Q1 — explicit UI filters (city / population / language).
 *
 * Pure module. Explicit filters are validated against the canonical
 * catalog and folded into `TherapistSearchPlan.hardFilters` so they run
 * through the SAME deterministic executor as query-derived filters.
 *
 * Resolution rule (never OR two conflicting values):
 *   - same canonical value      → deduplicate,
 *   - query has no value        → use the explicit filter,
 *   - inferred conflicts        → the explicit filter wins, and the
 *                                 conflict is recorded as metadata.
 */

import { normalizeForInterpretation } from "./query-normalization";
import {
  normalizeRegionsParam,
  normalizeServiceTypesParam,
  normalizeTherapyFormatsParam,
  THERAPIST_GENDERS,
  type MultiValueInput,
} from "./search-contract";
import type {
  Catalog,
  FilterConflict,
  SoftPreferences,
  StructuredFilters,
  ValidatedExplicitFilters,
} from "./query-interpreter.types";

export type RawExplicitFilters = {
  city?: string | null;
  population?: string | null;
  language?: string | null;
  regions?: MultiValueInput;
  serviceTypes?: MultiValueInput;
  professions?: MultiValueInput;
  modalities?: MultiValueInput;
  therapyFormats?: MultiValueInput;
  gender?: string | null;
  accessible?: boolean;
  verified?: boolean;
  lgbtqAffirming?: boolean;
  freeIntro?: boolean;
};

export const EMPTY_EXPLICIT: ValidatedExplicitFilters = {
  cityNames: [],
  populationSlugs: [],
  languageCodes: [],
  regionSlugs: [],
  serviceTypes: [],
  professionSlugs: [],
  modalitySlugs: [],
  therapyFormatSlugs: [],
  therapistGender: null,
  accessibleClinic: false,
  verifiedOnly: false,
  lgbtqAffirming: false,
  freeIntroOnly: false,
  rejected: [],
};

export function hasExplicitFilters(raw: RawExplicitFilters): boolean {
  const multi = (v: MultiValueInput) => (Array.isArray(v) ? v.length > 0 : Boolean(typeof v === "string" && v.trim()));
  return Boolean(
    raw.city?.trim() || raw.population?.trim() || raw.language?.trim() || multi(raw.regions) || multi(raw.serviceTypes),
    multi(raw.professions) ||
      multi(raw.modalities) ||
      multi(raw.therapyFormats) ||
      raw.gender ||
      raw.accessible ||
      raw.verified ||
      raw.lgbtqAffirming ||
      raw.freeIntro,
  );
}

/** Validate raw UI filter values against the canonical catalogs. */
export function validateExplicitFilters(raw: RawExplicitFilters, catalog: Catalog): ValidatedExplicitFilters {
  const out: ValidatedExplicitFilters = {
    cityNames: [],
    populationSlugs: [],
    languageCodes: [],
    regionSlugs: [],
    serviceTypes: [],
    professionSlugs: [],
    modalitySlugs: [],
    therapyFormatSlugs: [],
    therapistGender: null,
    accessibleClinic: false,
    verifiedOnly: false,
    lgbtqAffirming: false,
    freeIntroOnly: false,
    rejected: [],
  };

  const city = raw.city?.trim();
  if (city) {
    const n = normalizeForInterpretation(city);
    const hit = catalog.cities.find(
      (c) =>
        normalizeForInterpretation(c.canonical) === n || c.aliases.some((a) => normalizeForInterpretation(a) === n),
    );
    if (hit) out.cityNames.push(hit.canonical);
    else out.rejected.push({ category: "city", value: city });
  }

  const population = raw.population?.trim();
  if (population) {
    const n = normalizeForInterpretation(population);
    const hit = catalog.populations.find(
      (p) =>
        normalizeForInterpretation(p.slug) === n ||
        normalizeForInterpretation(p.name_he) === n ||
        p.aliases.some((a) => normalizeForInterpretation(a) === n),
    );
    if (hit) out.populationSlugs.push(hit.slug);
    else out.rejected.push({ category: "population", value: population });
  }

  const language = raw.language?.trim();
  if (language) {
    const n = normalizeForInterpretation(language);
    const hit = catalog.languages.find(
      (l) =>
        normalizeForInterpretation(l.code) === n ||
        normalizeForInterpretation(l.name_he) === n ||
        l.aliases.some((a) => normalizeForInterpretation(a) === n),
    );
    if (hit) out.languageCodes.push(hit.code);
    else out.rejected.push({ category: "language", value: language });
  }

  // Regions and service types are validated against the canonical contract
  // (not the DB catalog): both are closed, code-defined vocabularies.
  const regions = normalizeRegionsParam(raw.regions);
  out.regionSlugs = [...regions.values];
  for (const value of regions.rejected) out.rejected.push({ category: "region", value });

  const serviceTypes = normalizeServiceTypesParam(raw.serviceTypes);
  out.serviceTypes = [...serviceTypes.values];
  for (const value of serviceTypes.rejected) out.rejected.push({ category: "serviceType", value });

  const resolveSlugs = (
    rawValues: MultiValueInput,
    catalogValues: Array<{ slug: string }>,
    category: "profession" | "modality",
  ) => {
    const allowed = new Set(catalogValues.map((item) => item.slug));
    const values = [
      ...new Set(
        (Array.isArray(rawValues) ? rawValues : typeof rawValues === "string" ? rawValues.split(",") : [])
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const accepted: string[] = [];
    for (const value of values) {
      if (allowed.has(value)) accepted.push(value);
      else out.rejected.push({ category, value });
    }
    return accepted.sort();
  };
  out.professionSlugs = resolveSlugs(raw.professions, catalog.professions, "profession");
  out.modalitySlugs = resolveSlugs(raw.modalities, catalog.modalities, "modality");
  const formats = normalizeTherapyFormatsParam(raw.therapyFormats);
  out.therapyFormatSlugs = [...formats.values];
  for (const value of formats.rejected) out.rejected.push({ category: "therapyFormat", value });
  out.therapistGender = (THERAPIST_GENDERS as readonly string[]).includes(raw.gender ?? "")
    ? (raw.gender as "male" | "female")
    : null;
  if (raw.gender && !out.therapistGender) out.rejected.push({ category: "gender", value: raw.gender });
  out.accessibleClinic = Boolean(raw.accessible);
  out.verifiedOnly = Boolean(raw.verified);
  out.lgbtqAffirming = Boolean(raw.lgbtqAffirming);
  out.freeIntroOnly = Boolean(raw.freeIntro);

  return out;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

/**
 * Fold validated explicit filters into the interpreter's filters.
 * Returns NEW objects; inputs are not mutated.
 */
export function applyExplicitFilters(
  hard: StructuredFilters,
  soft: SoftPreferences,
  explicit: ValidatedExplicitFilters,
): {
  hardFilters: StructuredFilters;
  softPreferences: SoftPreferences;
  conflicts: FilterConflict[];
} {
  const hardFilters: StructuredFilters = {
    ...hard,
    professionSlugs: [...hard.professionSlugs],
    modalitySlugs: [...hard.modalitySlugs],
    populationSlugs: [...hard.populationSlugs],
    languageCodes: [...hard.languageCodes],
    deliveryModes: [...hard.deliveryModes],
    cityNames: [...hard.cityNames],
    regionSlugs: [...(hard.regionSlugs ?? [])],
  };
  const softPreferences: SoftPreferences = {
    ...soft,
    cities: [...soft.cities],
    populationSlugs: [...soft.populationSlugs],
    languageCodes: [...soft.languageCodes],
  };
  const conflicts: FilterConflict[] = [];

  const override = (
    category: FilterConflict["category"],
    inferredHard: string[],
    explicitValues: string[],
    setHard: (v: string[]) => void,
    clearSoft: () => void,
  ) => {
    if (explicitValues.length === 0) return;
    if (!sameSet(inferredHard, explicitValues) && inferredHard.length > 0) {
      conflicts.push({ category, inferred: inferredHard, explicit: explicitValues });
    }
    // The explicit filter is authoritative: it REPLACES the inferred value
    // rather than being OR-ed with it, and the soft echo is dropped.
    setHard([...explicitValues]);
    clearSoft();
  };

  override(
    "city",
    hardFilters.cityNames,
    explicit.cityNames,
    (v) => {
      hardFilters.cityNames = v;
    },
    () => {
      softPreferences.cities = [];
    },
  );
  override(
    "population",
    hardFilters.populationSlugs,
    explicit.populationSlugs,
    (v) => {
      hardFilters.populationSlugs = v;
    },
    () => {
      softPreferences.populationSlugs = [];
    },
  );
  override(
    "language",
    hardFilters.languageCodes,
    explicit.languageCodes,
    (v) => {
      hardFilters.languageCodes = v;
    },
    () => {
      softPreferences.languageCodes = [];
    },
  );
  override(
    "region",
    hardFilters.regionSlugs ?? [],
    explicit.regionSlugs,
    (v) => {
      hardFilters.regionSlugs = v;
    },
    () => {},
  );
  override(
    "serviceType",
    hardFilters.deliveryModes,
    explicit.serviceTypes,
    (v) => {
      hardFilters.deliveryModes = v;
    },
    () => {
      softPreferences.deliveryModes = [];
    },
  );
  override(
    "profession",
    hardFilters.professionSlugs,
    explicit.professionSlugs,
    (v) => {
      hardFilters.professionSlugs = v;
    },
    () => {
      softPreferences.professionSlugs = [];
    },
  );
  override(
    "modality",
    hardFilters.modalitySlugs,
    explicit.modalitySlugs,
    (v) => {
      hardFilters.modalitySlugs = v;
    },
    () => {
      softPreferences.modalitySlugs = [];
    },
  );
  if (explicit.therapistGender) hardFilters.therapistGender = explicit.therapistGender;
  hardFilters.therapyFormatSlugs = [...explicit.therapyFormatSlugs];
  hardFilters.accessibleClinic = explicit.accessibleClinic;
  hardFilters.verifiedOnly = explicit.verifiedOnly;
  hardFilters.lgbtqAffirming = explicit.lgbtqAffirming;
  hardFilters.freeIntroOnly = explicit.freeIntroOnly;

  return { hardFilters, softPreferences, conflicts };
}
