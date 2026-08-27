import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { ContactChannelAvailability } from "./contact-channel-settings";

const FAIL_CLOSED_CONTACT_CHANNEL_AVAILABILITY: ContactChannelAvailability = {
  email: false,
  whatsapp: false,
  phone: false,
};

export async function readContactChannelAvailability(): Promise<ContactChannelAvailability> {
  const { data, error } = await supabaseAdmin
    .from("contact_channel_settings")
    .select("email_enabled, whatsapp_enabled, phone_enabled")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    // Public contact channels must fail closed if the settings row cannot be
    // read. A temporary settings failure must never re-enable a channel that
    // an administrator intentionally disabled.
    console.error("[contact-channels] settings read failed", {
      code: error?.code ?? "missing_row",
    });
    return { ...FAIL_CLOSED_CONTACT_CHANNEL_AVAILABILITY };
  }

  return {
    email: data.email_enabled,
    whatsapp: data.whatsapp_enabled,
    phone: data.phone_enabled,
  };
}

export async function isContactChannelEnabled(
  method: keyof ContactChannelAvailability,
): Promise<boolean> {
  const availability = await readContactChannelAvailability();
  return availability[method];
}
