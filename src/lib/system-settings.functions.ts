import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";
import {
  publicInteractionSettings,
  SYSTEM_SETTING_LIMITS,
  type PublicInteractionSettings,
  type SystemSettings,
} from "./system-settings";

const SystemSettingsInput = z.object({
  supportEmail: z.string().trim().email().max(254),
  maintenanceEnabled: z.boolean(),
  searchIndexingEnabled: z.boolean(),
  requireVerifiedCredentialForPublish: z.boolean(),
  requirePaymentMethodForPublish: z.boolean(),
  requireContactMethodForPublish: z.boolean(),
  maxContactMethods: z
    .number()
    .int()
    .min(SYSTEM_SETTING_LIMITS.maxContactMethods.min)
    .max(SYSTEM_SETTING_LIMITS.maxContactMethods.max),
  leadMessageMaxLength: z
    .number()
    .int()
    .min(SYSTEM_SETTING_LIMITS.leadMessageMaxLength.min)
    .max(SYSTEM_SETTING_LIMITS.leadMessageMaxLength.max),
  leadChallengeTtlMinutes: z
    .number()
    .int()
    .min(SYSTEM_SETTING_LIMITS.leadChallengeTtlMinutes.min)
    .max(SYSTEM_SETTING_LIMITS.leadChallengeTtlMinutes.max),
  leadAntispamEnabled: z.boolean(),
  hideUnclaimedAfterFirstLead: z.boolean(),
  aiSearchEnabled: z.boolean(),
  aiFallbackEnabled: z.boolean(),
  searchResultsLimit: z
    .number()
    .int()
    .min(SYSTEM_SETTING_LIMITS.searchResultsLimit.min)
    .max(SYSTEM_SETTING_LIMITS.searchResultsLimit.max),
  showUnverifiedTherapists: z.boolean(),
  systemEmailsEnabled: z.boolean(),
  therapistNotificationsEnabled: z.boolean(),
});

export const getPublicInteractionSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicInteractionSettings> => {
    const { readSystemSettings } = await import("./system-settings.server");
    return publicInteractionSettings(await readSystemSettings());
  },
);

export const getAdminSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemSettings> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהגדרות המערכת.");
    const { readSystemSettings } = await import("./system-settings.server");
    return readSystemSettings();
  });

export const updateAdminSystemSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SystemSettingsInput.parse(input))
  .handler(async ({ data, context }): Promise<SystemSettings> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשינוי הגדרות המערכת.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_settings").upsert(
      {
        singleton: true,
        support_email: data.supportEmail,
        maintenance_enabled: data.maintenanceEnabled,
        search_indexing_enabled: data.searchIndexingEnabled,
        require_verified_credential_for_publish: data.requireVerifiedCredentialForPublish,
        require_payment_method_for_publish: data.requirePaymentMethodForPublish,
        require_contact_method_for_publish: data.requireContactMethodForPublish,
        max_contact_methods: data.maxContactMethods,
        lead_message_max_length: data.leadMessageMaxLength,
        lead_challenge_ttl_minutes: data.leadChallengeTtlMinutes,
        lead_antispam_enabled: data.leadAntispamEnabled,
        hide_unclaimed_after_first_lead: data.hideUnclaimedAfterFirstLead,
        ai_search_enabled: data.aiSearchEnabled,
        ai_fallback_enabled: data.aiFallbackEnabled,
        search_results_limit: data.searchResultsLimit,
        show_unverified_therapists: data.showUnverifiedTherapists,
        system_emails_enabled: data.systemEmailsEnabled,
        therapist_notifications_enabled: data.therapistNotificationsEnabled,
        updated_by: context.userId,
      },
      { onConflict: "singleton" },
    );
    if (error) throw new Error(error.message);

    return data;
  });

export type AdminBillingAvailability = {
  pricingActive: boolean;
  leadPriceAgorot: number | null;
};

export const getAdminBillingAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBillingAvailability> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהגדרת החיובים.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("billing_price_settings")
      .select("pricing_active, lead_price_agorot")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      pricingActive: data?.pricing_active ?? false,
      leadPriceAgorot: data?.lead_price_agorot ?? null,
    };
  });

export const updateAdminBillingAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pricingActive: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<AdminBillingAvailability> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשינוי מצב החיובים.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readError } = await supabaseAdmin
      .from("billing_price_settings")
      .select("lead_price_agorot")
      .eq("singleton", true)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (data.pricingActive && !current?.lead_price_agorot) {
      throw new Error("לא ניתן להפעיל חיובים לפני שנקבע מחיר לפנייה.");
    }
    const { error } = await supabaseAdmin.from("billing_price_settings").upsert(
      {
        singleton: true,
        pricing_active: data.pricingActive,
        lead_price_agorot: current?.lead_price_agorot ?? null,
        updated_by: context.userId,
      },
      { onConflict: "singleton" },
    );
    if (error) throw new Error(error.message);
    return { pricingActive: data.pricingActive, leadPriceAgorot: current?.lead_price_agorot ?? null };
  });
