export type SystemSettings = {
  supportEmail: string;
  maintenanceEnabled: boolean;
  searchIndexingEnabled: boolean;
  requireVerifiedCredentialForPublish: boolean;
  requirePaymentMethodForPublish: boolean;
  requireContactMethodForPublish: boolean;
  maxContactMethods: number;
  leadMessageMaxLength: number;
  leadChallengeTtlMinutes: number;
  leadAntispamEnabled: boolean;
  hideUnclaimedAfterFirstLead: boolean;
  aiSearchEnabled: boolean;
  aiFallbackEnabled: boolean;
  searchResultsLimit: number;
  showUnverifiedTherapists: boolean;
  systemEmailsEnabled: boolean;
  therapistNotificationsEnabled: boolean;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  supportEmail: "admin@tipulinks.co.il",
  maintenanceEnabled: false,
  // This switch is an additional kill switch only. The environment/canonical
  // production-origin SEO gates still have to allow indexing as well.
  searchIndexingEnabled: false,
  // Preserve the current onboarding behavior by default: credential review may
  // be pending/skipped, while payment and at least one contact method are required.
  requireVerifiedCredentialForPublish: false,
  requirePaymentMethodForPublish: true,
  requireContactMethodForPublish: true,
  maxContactMethods: 3,
  leadMessageMaxLength: 2000,
  leadChallengeTtlMinutes: 10,
  leadAntispamEnabled: true,
  hideUnclaimedAfterFirstLead: true,
  aiSearchEnabled: true,
  aiFallbackEnabled: true,
  searchResultsLimit: 20,
  showUnverifiedTherapists: true,
  systemEmailsEnabled: true,
  therapistNotificationsEnabled: true,
};

export const SYSTEM_SETTING_LIMITS = {
  maxContactMethods: { min: 1, max: 3 },
  leadMessageMaxLength: { min: 100, max: 2000 },
  leadChallengeTtlMinutes: { min: 2, max: 30 },
  searchResultsLimit: { min: 5, max: 50 },
} as const;

export type PublicInteractionSettings = Pick<
  SystemSettings,
  "leadMessageMaxLength" | "maxContactMethods"
>;

export function publicInteractionSettings(settings: SystemSettings): PublicInteractionSettings {
  return {
    leadMessageMaxLength: settings.leadMessageMaxLength,
    maxContactMethods: settings.maxContactMethods,
  };
}
