/**
 * Public therapist-profile contract.
 *
 * The public profile route may only ever receive the columns listed in
 * `PUBLIC_THERAPIST_COLUMNS`. `select("*")` is forbidden on any public path:
 * unrendered columns are still serialized into the SSR payload and shipped to
 * the browser.
 */

export const PUBLIC_THERAPIST_COLUMNS = [
  "id",
  "slug",
  "full_name",
  "professional_title",
  "short_intro",
  "full_description",
  "background",
  "years_experience",
  "city",
  "image_url",
  "verified",
  "lgbtq_affirming",
  "offers_free_intro",
  "free_intro_types",
  "free_intro_duration_minutes",
] as const;

export type PublicTherapistColumn = (typeof PUBLIC_THERAPIST_COLUMNS)[number];

export const PUBLIC_THERAPIST_SELECT = PUBLIC_THERAPIST_COLUMNS.join(", ");

/**
 * Columns that exist on `public.therapists` but must NEVER reach a public
 * response. Contact details are released exclusively by `recordCtaClick`,
 * through the privileged server client, after the CTA action.
 */
export const PRIVATE_THERAPIST_COLUMNS = [
  "email",
  "phone",
  "contact_destination",
  "preferred_contact_channel",
  "owner_account_id",
  "license_number",
  "bio_raw",
  "semantic_profile",
  "profile_status",
  "visibility",
  "is_active",
  "profile_claimed",
  "gender",
  "region",
  "country",
  "latitude",
  "longitude",
  "created_at",
] as const;

export type PublicTherapistProfile = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  short_intro: string | null;
  full_description: string | null;
  background: string | null;
  years_experience: number;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  free_intro_types: string[];
  free_intro_duration_minutes: number | null;
  professions: { slug: string; name: string; is_primary: boolean }[];
  modalities: { slug: string; name: string }[];
  therapy_formats: { slug: string; name: string }[];
  locations: {
    location_type: "clinic" | "home_visit" | "online" | "hospital" | "other";
    city: string | null;
    region: string | null;
    is_primary: boolean;
    accessibility_status: string;
    accessibility_features: string[];
    accessibility_note: string | null;
  }[];
  professional_memberships: { organization_name: string; member_since: number | null }[];
  service_arrangements: { organization_name: string; note: string | null }[];
  problems: { id: string; name: string; slug: string; parent_id: string | null }[];
  populations: { slug: string; name: string }[];
  languages: { code: string; name: string }[];
};
