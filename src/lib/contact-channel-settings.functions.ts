import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";
import type { ContactChannelAvailability } from "./contact-channel-settings";

const UpdateContactChannelAvailabilitySchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  phone: z.boolean(),
});

export const getContactChannelAvailability = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContactChannelAvailability> => {
    const { readContactChannelAvailability } = await import("./contact-channel-settings.server");
    return readContactChannelAvailability();
  },
);

export const getAdminContactChannelAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContactChannelAvailability> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהגדרות ערוצי הפנייה.");
    const { readContactChannelAvailability } = await import("./contact-channel-settings.server");
    return readContactChannelAvailability();
  });

export const updateAdminContactChannelAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateContactChannelAvailabilitySchema.parse(input))
  .handler(async ({ data, context }): Promise<ContactChannelAvailability> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשינוי הגדרות ערוצי הפנייה.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("contact_channel_settings")
      .upsert(
        {
          singleton: true,
          email_enabled: data.email,
          whatsapp_enabled: data.whatsapp,
          phone_enabled: data.phone,
          updated_by: context.userId,
        },
        { onConflict: "singleton" },
      );
    if (error) throw new Error(error.message);

    return {
      email: data.email,
      whatsapp: data.whatsapp,
      phone: data.phone,
    };
  });
