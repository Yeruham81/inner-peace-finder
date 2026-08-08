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

export type SearchResultCard = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  image_url: string | null;
  verified: boolean;
  years_experience: number;
  short_intro: string | null;
  /** Primary active clinic, when the therapist has one. */
  primary_clinic: CardClinicLocation | null;
  /** Active clinic locations beyond the primary one. */
  additional_clinic_count: number;
  online_available: boolean;
  /** Region labels with active home-visit availability. */
  home_visit_regions: string[];
  language_names: string[];
  population_names: string[];
  /** Internal ranking scores already required by the executor. */
  scores: { semantic: number; preference: number; quality: number };
};

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
  years_experience: number;
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
    additional_clinic_count: 0,
    online_available: false,
    home_visit_regions: [],
    language_names: row.language_names ?? [],
    population_names: row.population_names ?? [],
    scores: { semantic: row.score ?? 0, preference: 0, quality: 0 },
  };
}