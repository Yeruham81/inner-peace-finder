/**
 * Canonical explicit-search contract (Phase 1 of the search-results rebuild).
 *
 * Pure module — no Supabase, React or TanStack imports.
 *
 * URL representation
 * ------------------
 *   q            free text
 *   city         EXACTLY one canonical locality name (never region slugs)
 *   population   one canonical population slug
 *   language     one canonical language code
 *   regions      comma-separated canonical region slugs (normalized, deduped)
 *   serviceTypes comma-separated canonical `location_type` values
 *
 * Multi-value parameters are normalized, deduplicated, sorted into the
 * canonical declaration order and rendered as a comma-separated string so
 * one filter selection always produces exactly one URL.
 */

import { REGION_SLUGS, isRegionSlug, type RegionSlug } from "./locality-options";

/**
 * Canonical service types. These are REAL `location_type` enum values from
 * the database (`clinic | home_visit | online | hospital | other`); the
 * search contract exposes only the three the profile editor can produce.
 * There is no UI-only spelling such as `home-visit` and no `group` option.
 */
export const SERVICE_TYPES = ["clinic", "online", "home_visit"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Service types that describe availability at a physical place. */
export const PHYSICAL_SERVICE_TYPES: ServiceType[] = ["clinic", "home_visit"];

export const THERAPY_FORMAT_SLUGS = [
  "individual",
  "couples",
  "family",
  "parent_child",
  "group",
  "parent_guidance",
] as const;
export type TherapyFormatSlug = (typeof THERAPY_FORMAT_SLUGS)[number];
export const THERAPIST_GENDERS = ["male", "female"] as const;
export type SearchTherapistGender = (typeof THERAPIST_GENDERS)[number];

export function isServiceType(value: string): value is ServiceType {
  return (SERVICE_TYPES as readonly string[]).includes(value);
}

export type MultiValueInput = string | readonly string[] | null | undefined;

export function splitMultiValue(raw: MultiValueInput): string[] {
  const parts = Array.isArray(raw) ? [...raw] : typeof raw === "string" ? raw.split(",") : [];
  return parts.map((p) => String(p).trim()).filter((p) => p.length > 0);
}

export type NormalizedMulti<T extends string> = { values: T[]; rejected: string[] };

function normalizeAgainst<T extends string>(
  raw: MultiValueInput,
  order: readonly T[],
  isValid: (v: string) => v is T,
): NormalizedMulti<T> {
  const seen = new Set<T>();
  const rejected: string[] = [];
  for (const part of splitMultiValue(raw)) {
    const v = part.toLowerCase();
    if (isValid(v)) seen.add(v);
    else if (!rejected.includes(part)) rejected.push(part);
  }
  return { values: order.filter((v) => seen.has(v)), rejected };
}

/** Validate + normalize + dedupe the `regions` parameter. */
export function normalizeRegionsParam(raw: MultiValueInput): NormalizedMulti<RegionSlug> {
  return normalizeAgainst(raw, REGION_SLUGS, isRegionSlug);
}

/** Validate + normalize + dedupe the `serviceTypes` parameter. */
export function normalizeServiceTypesParam(raw: MultiValueInput): NormalizedMulti<ServiceType> {
  return normalizeAgainst(raw, SERVICE_TYPES, isServiceType);
}

export function normalizeTherapyFormatsParam(raw: MultiValueInput): NormalizedMulti<TherapyFormatSlug> {
  return normalizeAgainst(raw, THERAPY_FORMAT_SLUGS, (value): value is TherapyFormatSlug =>
    (THERAPY_FORMAT_SLUGS as readonly string[]).includes(value),
  );
}

function normalizeSlugList(raw: MultiValueInput): string[] {
  return [...new Set(splitMultiValue(raw).map((value) => value.toLowerCase()))].sort();
}

function parseFlag(value: string | boolean | null | undefined): boolean {
  return value === true || value === "1" || value === "true";
}

/** Canonical URL rendering of a multi-value parameter (`undefined` = absent). */
export function serializeMultiValue(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(",") : undefined;
}

/**
 * Temporary backward compatibility: older navigation placed region slugs in
 * `city`. A `city` value consisting ENTIRELY of known region slugs is
 * normalized to `regions`; anything else stays an exact locality. New
 * navigation never generates such URLs.
 */
export function normalizeLegacyCityParam(raw: string | null | undefined): {
  city: string;
  regions: RegionSlug[];
} {
  const value = (raw ?? "").trim();
  if (!value) return { city: "", regions: [] };
  const parts = splitMultiValue(value);
  if (parts.length > 0 && parts.every((p) => isRegionSlug(p.toLowerCase()))) {
    return { city: "", regions: normalizeRegionsParam(parts).values };
  }
  return { city: value, regions: [] };
}

export type ExplicitSearchContract = {
  q: string;
  /** Trusted canonical treatment-domain slugs supplied by curated UI. */
  problemSlugs: string[];
  city: string;
  population: string;
  language: string;
  regions: RegionSlug[];
  serviceTypes: ServiceType[];
  professionSlugs: string[];
  modalitySlugs: string[];
  therapyFormats: TherapyFormatSlug[];
  gender: SearchTherapistGender | "";
  accessible: boolean;
  verified: boolean;
  lgbtqAffirming: boolean;
  freeIntro: boolean;
};

/**
 * Single entry point used by the route and by SearchForm so the canonical
 * contract can never drift between them.
 */
export function resolveSearchContract(input: {
  q?: string | null;
  problem?: MultiValueInput;
  problemSlugs?: MultiValueInput;
  city?: string | null;
  population?: string | null;
  language?: string | null;
  regions?: MultiValueInput;
  serviceTypes?: MultiValueInput;
  professions?: MultiValueInput;
  professionSlugs?: MultiValueInput;
  modalities?: MultiValueInput;
  modalitySlugs?: MultiValueInput;
  therapyFormats?: MultiValueInput;
  gender?: string | null;
  accessible?: string | boolean | null;
  verified?: string | boolean | null;
  lgbtqAffirming?: string | boolean | null;
  freeIntro?: string | boolean | null;
}): ExplicitSearchContract {
  const legacy = normalizeLegacyCityParam(input.city);
  const fromParam = normalizeRegionsParam(input.regions).values;
  const regions = fromParam.length > 0 ? fromParam : legacy.regions;
  return {
    q: (input.q ?? "").trim(),
    problemSlugs: normalizeSlugList(input.problem ?? input.problemSlugs),
    city: legacy.city,
    population: (input.population ?? "").trim(),
    language: (input.language ?? "").trim(),
    regions,
    serviceTypes: normalizeServiceTypesParam(input.serviceTypes).values,
    professionSlugs: normalizeSlugList(input.professions ?? input.professionSlugs),
    modalitySlugs: normalizeSlugList(input.modalities ?? input.modalitySlugs),
    therapyFormats: normalizeTherapyFormatsParam(input.therapyFormats).values,
    gender: (THERAPIST_GENDERS as readonly string[]).includes(input.gender ?? "")
      ? (input.gender as SearchTherapistGender)
      : "",
    accessible: parseFlag(input.accessible),
    verified: parseFlag(input.verified),
    lgbtqAffirming: parseFlag(input.lgbtqAffirming),
    freeIntro: parseFlag(input.freeIntro),
  };
}

export function hasAnyExplicitFilter(c: ExplicitSearchContract): boolean {
  return Boolean(
    c.city ||
    c.problemSlugs.length ||
    c.population ||
    c.language ||
    c.regions.length ||
    c.serviceTypes.length ||
    c.professionSlugs.length ||
    c.modalitySlugs.length ||
    c.therapyFormats.length ||
    c.gender ||
    c.accessible ||
    c.verified ||
    c.lgbtqAffirming ||
    c.freeIntro,
  );
}
