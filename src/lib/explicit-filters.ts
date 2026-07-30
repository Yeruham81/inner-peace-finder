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
};

export const EMPTY_EXPLICIT: ValidatedExplicitFilters = {
  cityNames: [],
  populationSlugs: [],
  languageCodes: [],
  rejected: [],
};

export function hasExplicitFilters(raw: RawExplicitFilters): boolean {
  return Boolean(raw.city?.trim() || raw.population?.trim() || raw.language?.trim());
}

/** Validate raw UI filter values against the canonical catalogs. */
export function validateExplicitFilters(
  raw: RawExplicitFilters,
  catalog: Catalog,
): ValidatedExplicitFilters {
  const out: ValidatedExplicitFilters = {
    cityNames: [], populationSlugs: [], languageCodes: [], rejected: [],
  };

  const city = raw.city?.trim();
  if (city) {
    const n = normalizeForInterpretation(city);
    const hit = catalog.cities.find(
      (c) =>
        normalizeForInterpretation(c.canonical) === n ||
        c.aliases.some((a) => normalizeForInterpretation(a) === n),
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

  override("city", hardFilters.cityNames, explicit.cityNames,
    (v) => { hardFilters.cityNames = v; },
    () => { softPreferences.cities = []; });
  override("population", hardFilters.populationSlugs, explicit.populationSlugs,
    (v) => { hardFilters.populationSlugs = v; },
    () => { softPreferences.populationSlugs = []; });
  override("language", hardFilters.languageCodes, explicit.languageCodes,
    (v) => { hardFilters.languageCodes = v; },
    () => { softPreferences.languageCodes = []; });

  return { hardFilters, softPreferences, conflicts };
}