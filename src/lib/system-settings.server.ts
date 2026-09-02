import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from "./system-settings";

type SystemSettingsRow = {
  support_email: string;
  maintenance_enabled: boolean;
  search_indexing_enabled: boolean;
  require_verified_credential_for_publish: boolean;
  require_payment_method_for_publish: boolean;
  require_contact_method_for_publish: boolean;
  max_contact_methods: number;
  lead_message_max_length: number;
  lead_challenge_ttl_minutes: number;
  lead_antispam_enabled: boolean;
  hide_unclaimed_after_first_lead: boolean;
  ai_search_enabled: boolean;
  ai_fallback_enabled: boolean;
  search_results_limit: number;
  show_unverified_therapists: boolean;
  system_emails_enabled: boolean;
  therapist_notifications_enabled: boolean;
};

function mapRow(row: SystemSettingsRow): SystemSettings {
  return {
    supportEmail: row.support_email,
    maintenanceEnabled: row.maintenance_enabled,
    searchIndexingEnabled: row.search_indexing_enabled,
    requireVerifiedCredentialForPublish: row.require_verified_credential_for_publish,
    requirePaymentMethodForPublish: row.require_payment_method_for_publish,
    requireContactMethodForPublish: row.require_contact_method_for_publish,
    maxContactMethods: row.max_contact_methods,
    leadMessageMaxLength: row.lead_message_max_length,
    leadChallengeTtlMinutes: row.lead_challenge_ttl_minutes,
    leadAntispamEnabled: row.lead_antispam_enabled,
    hideUnclaimedAfterFirstLead: row.hide_unclaimed_after_first_lead,
    aiSearchEnabled: row.ai_search_enabled,
    aiFallbackEnabled: row.ai_fallback_enabled,
    searchResultsLimit: row.search_results_limit,
    showUnverifiedTherapists: row.show_unverified_therapists,
    systemEmailsEnabled: row.system_emails_enabled,
    therapistNotificationsEnabled: row.therapist_notifications_enabled,
  };
}

export async function readSystemSettings(): Promise<SystemSettings> {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select(
      "support_email, maintenance_enabled, search_indexing_enabled, require_verified_credential_for_publish, require_payment_method_for_publish, require_contact_method_for_publish, max_contact_methods, lead_message_max_length, lead_challenge_ttl_minutes, lead_antispam_enabled, hide_unclaimed_after_first_lead, ai_search_enabled, ai_fallback_enabled, search_results_limit, show_unverified_therapists, system_emails_enabled, therapist_notifications_enabled",
    )
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    console.error("[system-settings] settings read failed", { code: error?.code ?? "missing_row" });
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }

  return mapRow(data as SystemSettingsRow);
}
