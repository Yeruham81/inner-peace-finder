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
  "years_experience",
  "city",
  "image_url",
  "verified",
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
  "background",
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
  years_experience: number;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  problems: { id: string; name: string; slug: string; parent_id: string | null }[];
  populations: { slug: string; name: string }[];
  languages: { code: string; name: string }[];
};