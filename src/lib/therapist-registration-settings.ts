export type TherapistRegistrationAvailability = {
  enabled: boolean;
};

// Registration is intentionally fail-closed while the platform is in a
// controlled pre-launch state. The persisted database setting is the source
// of truth and must explicitly enable new therapist accounts.
export const DEFAULT_THERAPIST_REGISTRATION_AVAILABILITY: TherapistRegistrationAvailability = {
  enabled: false,
};

export const THERAPIST_REGISTRATION_CLOSED_MESSAGE =
  "הרשמת מטפלים חדשים אינה זמינה כרגע. ניתן יהיה להירשם עם פתיחת השירות.";
