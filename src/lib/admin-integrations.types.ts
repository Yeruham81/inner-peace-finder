export type IntegrationHealth = "healthy" | "warning" | "error" | "planned" | "unchecked";

export type AdminIntegrationKey =
  | "supabase"
  | "openai"
  | "twilio"
  | "meta-whatsapp"
  | "brevo"
  | "zoho"
  | "data-gov"
  | "google-analytics"
  | "payment";

export type AdminIntegrationCheck = {
  label: string;
  state: IntegrationHealth;
  detail?: string;
  at?: string;
};

export type AdminIntegrationStatus = {
  key: AdminIntegrationKey;
  provider: string;
  description: string;
  uses: string[];
  state: IntegrationHealth;
  summary: string;
  checkedAt: string;
  checks: AdminIntegrationCheck[];
};
