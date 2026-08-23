import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountActivityChannel = "whatsapp" | "phone" | "email" | "other";

export type AccountLeadActivity = {
  id: string;
  created_at: string;
  channel: AccountActivityChannel;
  delivery_status: string;
  workflow_status: "new" | "in_progress" | "handled" | "archived";
  charge_agorot: number;
};

export type AccountDashboardSnapshot = {
  therapist_id: string | null;
  period_days: number;
  summary: {
    impressions: number;
    previous_impressions: number;
    profile_views: number;
    previous_profile_views: number;
    unique_profile_views: number;
    previous_unique_profile_views: number;
    leads: number;
    previous_leads: number;
    charges_agorot: number;
    previous_charges_agorot: number;
  };
  daily: Array<{
    date: string;
    impressions: number;
    profile_views: number;
    leads: number;
  }>;
  channels: Array<{
    channel: AccountActivityChannel;
    count: number;
  }>;
  recent_leads: AccountLeadActivity[];
};

export type AccountBillingTransaction = {
  id: string;
  created_at: string;
  source_type: "cta_click" | "voice_call";
  lead_id: string | null;
  channel: AccountActivityChannel;
  amount_agorot: number;
};

export type AccountBillingHistory = {
  month_start: string;
  charged_leads: number;
  charged_agorot: number;
  transactions: AccountBillingTransaction[];
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("לא ניתן לקרוא את נתוני החשבון.");
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asChannel(value: unknown): AccountActivityChannel {
  return value === "whatsapp" || value === "phone" || value === "email" ? value : "other";
}

function parseLead(value: unknown): AccountLeadActivity {
  const row = asObject(value);
  const workflowStatus =
    row.workflow_status === "in_progress" || row.workflow_status === "handled" || row.workflow_status === "archived"
      ? row.workflow_status
      : "new";
  return {
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    channel: asChannel(row.channel),
    delivery_status: String(row.delivery_status ?? "pending"),
    workflow_status: workflowStatus,
    charge_agorot: asNumber(row.charge_agorot),
  };
}

function parseDashboard(value: unknown): AccountDashboardSnapshot {
  const root = asObject(value);
  const summary = asObject(root.summary);
  return {
    therapist_id: typeof root.therapist_id === "string" ? root.therapist_id : null,
    period_days: asNumber(root.period_days) || 30,
    summary: {
      impressions: asNumber(summary.impressions),
      previous_impressions: asNumber(summary.previous_impressions),
      profile_views: asNumber(summary.profile_views),
      previous_profile_views: asNumber(summary.previous_profile_views),
      unique_profile_views: asNumber(summary.unique_profile_views),
      previous_unique_profile_views: asNumber(summary.previous_unique_profile_views),
      leads: asNumber(summary.leads),
      previous_leads: asNumber(summary.previous_leads),
      charges_agorot: asNumber(summary.charges_agorot),
      previous_charges_agorot: asNumber(summary.previous_charges_agorot),
    },
    daily: Array.isArray(root.daily)
      ? root.daily.map((value) => {
          const row = asObject(value);
          return {
            date: String(row.date ?? ""),
            impressions: asNumber(row.impressions),
            profile_views: asNumber(row.profile_views),
            leads: asNumber(row.leads),
          };
        })
      : [],
    channels: Array.isArray(root.channels)
      ? root.channels.map((value) => {
          const row = asObject(value);
          return { channel: asChannel(row.channel), count: asNumber(row.count) };
        })
      : [],
    recent_leads: Array.isArray(root.recent_leads) ? root.recent_leads.map(parseLead) : [],
  };
}

function parseBillingHistory(value: unknown): AccountBillingHistory {
  const root = asObject(value);
  return {
    month_start: String(root.month_start ?? ""),
    charged_leads: asNumber(root.charged_leads),
    charged_agorot: asNumber(root.charged_agorot),
    transactions: Array.isArray(root.transactions)
      ? root.transactions.map((value) => {
          const row = asObject(value);
          return {
            id: String(row.id ?? ""),
            created_at: String(row.created_at ?? ""),
            source_type: row.source_type === "voice_call" ? "voice_call" : "cta_click",
            lead_id: typeof row.lead_id === "string" ? row.lead_id : null,
            channel: asChannel(row.channel),
            amount_agorot: asNumber(row.amount_agorot),
          };
        })
      : [],
  };
}

export const getMyAccountDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountDashboardSnapshot> => {
    const { data, error } = await context.supabase.rpc("get_my_account_dashboard");
    if (error) throw new Error(error.message);
    return parseDashboard(data);
  });

export const getMyAccountLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountLeadActivity[]> => {
    const { data, error } = await context.supabase.rpc("get_my_account_leads", { _limit: 500 });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.map(parseLead) : [];
  });

export const getMyBillingTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountBillingHistory> => {
    const { data, error } = await context.supabase.rpc("get_my_billing_transactions", {
      _limit: 100,
    });
    if (error) throw new Error(error.message);
    return parseBillingHistory(data);
  });
