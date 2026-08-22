export type TherapistAvatarGender = "male" | "female" | "unspecified" | "" | null | undefined;

const DEFAULT_AVATARS = {
  male: "/images/default-therapist-male.svg",
  female: "/images/default-therapist-female.svg",
} as const;

/**
 * Returns a stable, local illustration for profiles that do not have an
 * uploaded photo. The URL is deliberately derived at render time rather than
 * stored in `therapists.image_url`, so changing gender immediately selects the
 * correct fallback and a real uploaded photo always takes precedence.
 */
export function defaultTherapistAvatar(gender: TherapistAvatarGender): string | null {
  return gender === "male" || gender === "female" ? DEFAULT_AVATARS[gender] : null;
}
