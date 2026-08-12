/**
 * Editor -> public-profile-view adapter.
 *
 * Converts the therapist editor's in-memory form state into the existing
 * public presentation view model (`TherapistProfileViewData`) so the preview
 * reuses the real public profile component. It is a pure function: it never
 * reads the database, never saves, and never widens the public DTO.
 */
import type { TherapistProfileViewData } from "@/components/therapist-profile-view";
import { orderCanonicalLanguages } from "@/lib/language-options";
import type { EditorOptions } from "@/lib/therapist-profile.functions";

export type PreviewFormLocation = {
  city: string;
  region: string;
  accessibility_status: string;
  accessibility_features: string[];
  accessibility_note: string;
};

export type PreviewFormState = {
  full_name: string;
  professional_title: string;
  full_description: string;
  short_intro: string;
  background: string;
  years_experience: string;
  image_url: string;
  profession_ids: string[];
  modality_ids: string[];
  language_ids: string[];
  population_ids: string[];
  locations: PreviewFormLocation[];
  online_available: boolean;
  home_visit_available: boolean;
  home_visit_regions: string[];
  therapy_format_ids: string[];
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  free_intro_types: string[];
  free_intro_duration_minutes: string;
  professional_memberships: {
    organization_name: string;
    membership_start_date?: string;
    member_since: string;
  }[];
  service_arrangements: { organization_name: string; note: string }[];
};

export function buildPreviewViewData(
  form: PreviewFormState,
  options: EditorOptions | undefined,
  saved: { id?: string | null; verified?: boolean | null } | null | undefined,
): TherapistProfileViewData {
  const hasPhysicalLocation = form.locations.some((location) => location.city.trim().length > 0);

  const locations: TherapistProfileViewData["locations"] = [
    ...form.locations
      .filter((item) => item.city.trim())
      .map((item, index) => ({
        location_type: "clinic" as const,
        city: item.city.trim(),
        region: item.region || null,
        is_primary: index === 0,
        accessibility_status: item.accessibility_status,
        accessibility_features: item.accessibility_features,
        accessibility_note: item.accessibility_note || null,
      })),
    ...(form.online_available
      ? [
          {
            location_type: "online" as const,
            city: null,
            region: null,
            is_primary: !hasPhysicalLocation,
            accessibility_status: "unknown",
            accessibility_features: [],
            accessibility_note: null,
          },
        ]
      : []),
    ...(form.home_visit_available
      ? (form.home_visit_regions.length > 0 ? form.home_visit_regions : [null]).map((region) => ({
          location_type: "home_visit" as const,
          city: null,
          region,
          is_primary: false,
          accessibility_status: "unknown",
          accessibility_features: [],
          accessibility_note: null,
        }))
      : []),
  ];

  const orderedLanguages = orderCanonicalLanguages(options?.languages ?? []);

  return {
    id: saved?.id ?? "preview",
    full_name: form.full_name.trim(),
    professional_title: form.professional_title.trim() || null,
    short_intro: form.short_intro.trim() || null,
    full_description: form.full_description.trim() || null,
    background: form.background.trim() || null,
    years_experience: form.years_experience.trim() === "" ? null : Number(form.years_experience),
    city: form.locations.find((location) => location.city.trim())?.city.trim() || null,
    image_url: form.image_url.trim() || null,
    verified: saved?.verified ?? false,
    lgbtq_affirming: form.lgbtq_affirming,
    offers_free_intro: form.offers_free_intro,
    free_intro_types: form.free_intro_types,
    free_intro_duration_minutes: form.free_intro_duration_minutes ? Number(form.free_intro_duration_minutes) : null,
    professions: (options?.professions ?? [])
      .filter((item) => form.profession_ids.includes(item.id))
      .map((item) => ({ slug: item.slug, name: item.name_he, is_primary: false })),
    modalities: (options?.modalities ?? [])
      .filter((item) => form.modality_ids.includes(item.id))
      .map((item) => ({ slug: item.slug, name: item.name_he })),
    therapy_formats: (options?.therapy_formats ?? [])
      .filter((item) => form.therapy_format_ids.includes(item.id))
      .map((item) => ({ slug: item.slug, name: item.name_he })),
    locations,
    professional_memberships: form.professional_memberships
      .filter((item) => item.organization_name.trim())
      .map((item) => ({
        organization_name: item.organization_name,
        member_since: item.membership_start_date
          ? Number(item.membership_start_date.slice(0, 4))
          : item.member_since
            ? Number(item.member_since)
            : null,
      })),
    service_arrangements: form.service_arrangements
      .filter((item) => item.organization_name.trim())
      .map((item) => ({ organization_name: item.organization_name, note: item.note || null })),
    // Semantic extraction powers search ranking; it is not a therapist-declared
    // public field, so the preview must not present it as one.
    problems: [],
    populations: (options?.populations ?? [])
      .filter((population) => form.population_ids.includes(population.id))
      .map((population) => ({ slug: population.slug, name: population.name })),
    languages: orderedLanguages
      .filter((language) => form.language_ids.includes(language.id))
      .map((language) => ({ code: language.code, name: language.name })),
  };
}
