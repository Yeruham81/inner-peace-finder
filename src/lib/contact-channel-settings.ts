import type { PublicContactMethod } from "./public-therapist-profile";

export type ContactChannelAvailability = Record<PublicContactMethod, boolean>;

// Safe launch defaults: email is available; channels that still depend on
// external business verification fail closed until explicitly enabled.
export const DEFAULT_CONTACT_CHANNEL_AVAILABILITY: ContactChannelAvailability = {
  email: true,
  whatsapp: false,
  phone: false,
};

export function filterAvailableContactMethods(
  methods: readonly PublicContactMethod[],
  availability: ContactChannelAvailability,
  maxMethods = 3,
): PublicContactMethod[] {
  const safeMax = Math.max(1, Math.min(3, Math.trunc(maxMethods)));
  return [...new Set(methods)].filter((method) => availability[method]).slice(0, safeMax);
}

export function resolveAvailablePreferredContactMethod(
  methods: readonly PublicContactMethod[],
  preferred: PublicContactMethod | null | undefined,
): PublicContactMethod | null {
  if (preferred && methods.includes(preferred)) return preferred;
  return methods[0] ?? null;
}
