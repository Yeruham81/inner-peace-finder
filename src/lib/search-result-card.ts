/**
 * Shared result-card data contract for therapist result cards.
 *
 * Pure types. This is the contract `TherapistCard` consumes; the Unified
 * production flow produces it directly and the DEV-only Legacy flow uses an
 * explicit adapter. It NEVER contains contact details (no email, no phone),
 * and the displayed professional identity is `professional_title` only —
 * professions are search/ranking metadata, not display data.
 */

export type CardClinicLocation = {
  city: string;
  /** Canonical region slug when the stored region value is recognized. */
  region_slug: string | null;
  /** Region label as stored, for display. */
  region_label: string | null;
};

export type TreatmentDomainTag = {
  slug: string;
  name: string;
  weight: number;
  matched: boolean;
};

export type PopulationTag = {
  slug: string;
  name: string;
  matched: boolean;
};

export type SearchResultCard = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  image_url: string | null;
  verified: boolean;
  years_experience: number | null;
  short_intro: string | null;
  /** Primary active clinic, when the therapist has one. */
  primary_clinic: CardClinicLocation | null;
  /** Every active clinic location, ordered with the primary clinic first. */
  clinic_locations: CardClinicLocation[];
  /** Active clinic locations beyond the primary one. */
  additional_clinic_count: number;
  online_available: boolean;
  gender: "male" | "female" | null;
  accessible_clinic: boolean;
  /** Region labels with active home-visit availability. */
  home_visit_regions: string[];
  language_names: string[];
  population_names: string[];
  population_tags: PopulationTag[];
  modality_names: string[];
  treatment_domains: TreatmentDomainTag[];
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  /** Internal ranking scores already required by the executor. */
  scores: { semantic: number; preference: number; quality: number };
};

export type ActiveLocationRow = {
  location_type: string;
  city: string | null;
  region: string | null;
  is_primary: boolean | null;
  accessibility_status?: string | null;
};

export type CardLocationDisplay = {
  primary_clinic: CardClinicLocation | null;
  clinic_locations: CardClinicLocation[];
  additional_clinic_count: number;
  online_available: boolean;
  home_visit_regions: string[];
  accessible_clinic: boolean;
  /** Active clinics exist but none was marked primary (historical data). */
  primary_clinic_fallback_used: boolean;
};

/**
 * Derive card location display data from ACTIVE `therapist_locations` rows.
 *
 * Read-only and deterministic:
 *  - primary clinic = the explicitly marked `is_primary` active clinic,
 *  - if malformed historical data has active clinics but no primary marker,
 *    the first clinic in Hebrew city order is used for display ONLY and the
 *    fallback is reported,
 *  - remaining active clinics are counted separately,
 *  - online availability comes from an active `online` row,
 *  - home-visit regions come from active `home_visit` rows.
 */
export function buildCardLocationDisplay(
  rows: readonly ActiveLocationRow[],
  resolveRegion: (stored: string | null) => { slug: string | null; label: string | null },
): CardLocationDisplay {
  const clinics = rows
    .filter((r) => r.location_type === "clinic" && (r.city ?? "").trim().length > 0)
    .sort((a, b) => (a.city ?? "").localeCompare(b.city ?? "", "he"));

  const marked = clinics.filter((r) => r.is_primary === true);
  const chosen = marked[0] ?? clinics[0] ?? null;
  const fallbackUsed = marked.length === 0 && clinics.length > 0;

  const primary_clinic: CardClinicLocation | null = chosen
    ? {
        city: (chosen.city ?? "").trim(),
        region_slug: resolveRegion(chosen.region).slug,
        region_label: resolveRegion(chosen.region).label,
      }
    : null;

  const clinic_locations: CardClinicLocation[] = chosen
    ? [chosen, ...clinics.filter((clinic) => clinic !== chosen)].map((clinic) => ({
        city: (clinic.city ?? "").trim(),
        region_slug: resolveRegion(clinic.region).slug,
        region_label: resolveRegion(clinic.region).label,
      }))
    : [];

  const home_visit_regions: string[] = [];
  for (const r of rows) {
    if (r.location_type !== "home_visit") continue;
    const label = resolveRegion(r.region).label;
    if (label && !home_visit_regions.includes(label)) home_visit_regions.push(label);
  }

  return {
    primary_clinic,
    clinic_locations,
    additional_clinic_count: clinics.length > 0 ? clinics.length - 1 : 0,
    online_available: rows.some((r) => r.location_type === "online"),
    home_visit_regions,
    accessible_clinic: clinics.some((clinic) => clinic.accessibility_status === "accessible"),
    primary_clinic_fallback_used: fallbackUsed,
  };
}

/** Human-readable location line, or null when there is nothing to show. */
export function cardLocationLine(card: SearchResultCard): string | null {
  const parts: string[] = [];
  if (card.primary_clinic?.city) {
    parts.push(
      card.additional_clinic_count > 0
        ? `${card.primary_clinic.city} +${card.additional_clinic_count}`
        : card.primary_clinic.city,
    );
  }
  if (card.home_visit_regions.length > 0) {
    parts.push(`ביקורי בית: ${card.home_visit_regions.join(", ")}`);
  }
  if (parts.length === 0 && card.online_available) parts.push("טיפול אונליין");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Explicit adapter for the DEV-only Legacy flow and the problem pages, which
 * still produce the older `ScoredTherapist`-shaped rows. Kept narrow on
 * purpose: the Legacy backend is not extended to mirror new fields.
 */
export function legacyRowToCard(row: {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  short_intro: string | null;
  years_experience: number | null;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  score?: number;
  population_names?: string[];
  language_names?: string[];
}): SearchResultCard {
  return {
    id: row.id,
    slug: row.slug,
    full_name: row.full_name,
    professional_title: row.professional_title,
    image_url: row.image_url,
    verified: row.verified,
    years_experience: row.years_experience,
    short_intro: row.short_intro,
    primary_clinic: row.city ? { city: row.city, region_slug: null, region_label: null } : null,
    clinic_locations: row.city ? [{ city: row.city, region_slug: null, region_label: null }] : [],
    additional_clinic_count: 0,
    online_available: false,
    gender: null,
    accessible_clinic: false,
    home_visit_regions: [],
    language_names: row.language_names ?? [],
    population_names: row.population_names ?? [],
    population_tags: [],
    modality_names: [],
    treatment_domains: [],
    lgbtq_affirming: false,
    offers_free_intro: false,
    scores: { semantic: row.score ?? 0, preference: 0, quality: 0 },
  };
}
