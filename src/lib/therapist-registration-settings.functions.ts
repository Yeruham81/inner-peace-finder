import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";
import type { TherapistRegistrationAvailability } from "./therapist-registration-settings";

const UpdateTherapistRegistrationSchema = z.object({
  enabled: z.boolean(),
});

export const getTherapistRegistrationAvailability = createServerFn({ method: "GET" }).handler(
  async (): Promise<TherapistRegistrationAvailability> => {
    const { readTherapistRegistrationAvailability } = await import("./therapist-registration-settings.server");
    return readTherapistRegistrationAvailability();
  },
);

export const getAdminTherapistRegistrationAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TherapistRegistrationAvailability> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהגדרת הרשמת מטפלים.");
    const { readTherapistRegistrationAvailability } = await import("./therapist-registration-settings.server");
    return readTherapistRegistrationAvailability();
  });

export const updateAdminTherapistRegistrationAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateTherapistRegistrationSchema.parse(input))
  .handler(async ({ data, context }): Promise<TherapistRegistrationAvailability> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשינוי הגדרת הרשמת מטפלים.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("therapist_registration_settings")
      .upsert(
        {
          singleton: true,
          registration_enabled: data.enabled,
          updated_by: context.userId,
        },
        { onConflict: "singleton" },
      );
    if (error) throw new Error(error.message);

    return { enabled: data.enabled };
  });
