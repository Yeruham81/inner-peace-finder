import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  DEFAULT_THERAPIST_REGISTRATION_AVAILABILITY,
  THERAPIST_REGISTRATION_CLOSED_MESSAGE,
  type TherapistRegistrationAvailability,
} from "./therapist-registration-settings";

export async function readTherapistRegistrationAvailability(): Promise<TherapistRegistrationAvailability> {
  const { data, error } = await supabaseAdmin
    .from("therapist_registration_settings")
    .select("registration_enabled")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    console.error("[therapist-registration] settings read failed", {
      code: error?.code ?? "missing_row",
    });
    return { ...DEFAULT_THERAPIST_REGISTRATION_AVAILABILITY };
  }

  return { enabled: data.registration_enabled };
}

export async function assertTherapistRegistrationEnabled(): Promise<void> {
  const availability = await readTherapistRegistrationAvailability();
  if (!availability.enabled) throw new Error(THERAPIST_REGISTRATION_CLOSED_MESSAGE);
}
