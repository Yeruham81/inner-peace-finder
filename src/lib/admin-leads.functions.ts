import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";

export type AdminLeadChannel = "WhatsApp" | "טלפון" | "אימייל" | "אחר";
export type AdminLeadStatus = "נוצרה" | "נמסרה" | "נענתה" | "נכשלה";

export type AdminLeadRow = {
  id: string;
  createdAt: string;
  therapistId: string;
  therapistName: string;
  channel: AdminLeadChannel;
  source: string;
  status: AdminLeadStatus;
  deliveryStatus: string;
  workflowStatus: "new" | "in_progress" | "handled" | "archived";
  workflowUpdatedAt: string | null;
  ctaEventId: string | null;
  providerMessageId: string | null;
};

type JoinedTherapist = { full_name?: string | null };
type LeadRecord = {
  id: string;
  created_at: string;
  therapist_id: string;
  session_id: string;
  cta_event_id: string | null;
  delivery_channel: string | null;
  delivery_status: string;
  provider_message_id: string | null;
  therapist_status: string;
  therapist_updated_at: string | null;
  therapists?: unknown;
};

type AnalyticsSourceRow = {
  session_id: string;
  therapist_id: string | null;
  page_source: string | null;
  created_at: string;
};

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 100;

function firstJoin<T>(value: unknown): T {
  return (Array.isArray(value) ? value[0] : (value ?? {})) as T;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function adminChannel(value: string | null): AdminLeadChannel {
  if (value === "phone" || value === "phone_call") return "טלפון";
  if (value === "whatsapp") return "WhatsApp";
  if (value === "email") return "אימייל";
  return "אחר";
}

function adminStatus(deliveryStatus: string, channel: AdminLeadChannel): AdminLeadStatus {
  if (channel === "טלפון" && ["connected", "answered", "in-progress", "completed"].includes(deliveryStatus)) {
    return "נענתה";
  }
  if (["sent", "delivered"].includes(deliveryStatus)) return "נמסרה";
  if (
    ["failed", "busy", "no-answer", "canceled", "cancelled", "cancelled_after_opt_out", "expired"].includes(
      deliveryStatus,
    )
  ) {
    return "נכשלה";
  }
  return "נוצרה";
}

function workflowStatus(value: string): AdminLeadRow["workflowStatus"] {
  if (value === "in_progress" || value === "handled" || value === "archived") return value;
  return "new";
}

function sourceLabel(value: string | null | undefined): string {
  if (value === "search") return "תוצאות חיפוש";
  if (value === "problem") return "עמוד תחום טיפול";
  if (value === "therapist_profile") return "עמוד פרופיל";
  if (value === "stress_test") return "בדיקת מערכת";
  return "לא ידוע";
}

async function loadAllLeads(): Promise<LeadRecord[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: LeadRecord[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("lead_events")
      .select(
        "id, created_at, therapist_id, session_id, cta_event_id, delivery_channel, delivery_status, provider_message_id, therapist_status, therapist_updated_at, therapists:therapist_id(full_name)",
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as LeadRecord[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadSourceMap(leads: LeadRecord[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!leads.length) return result;

  try {
    const { hashValue } = await import("./lead-challenge.server");
    const leadKeys = leads.map((lead) => ({
      lead,
      sessionHash: hashValue(lead.session_id),
    }));
    const sessionHashes = uniqueStrings(leadKeys.map((item) => item.sessionHash));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const events: AnalyticsSourceRow[] = [];

    for (const sessionChunk of chunks(sessionHashes, IN_CHUNK_SIZE)) {
      const { data, error } = await supabaseAdmin
        .from("analytics_events")
        .select("session_id, therapist_id, page_source, created_at")
        .eq("event_name", "cta_clicked")
        .in("session_id", sessionChunk)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      events.push(...((data ?? []) as AnalyticsSourceRow[]));
    }

    const byKey = new Map<string, AnalyticsSourceRow[]>();
    for (const event of events) {
      if (!event.therapist_id) continue;
      const key = `${event.session_id}:${event.therapist_id}`;
      const list = byKey.get(key) ?? [];
      list.push(event);
      byKey.set(key, list);
    }

    for (const { lead, sessionHash } of leadKeys) {
      const candidates = byKey.get(`${sessionHash}:${lead.therapist_id}`) ?? [];
      const leadTime = Date.parse(lead.created_at);
      const matched = candidates
        .map((event) => ({ event, delta: leadTime - Date.parse(event.created_at) }))
        .filter(({ delta }) => delta >= -2 * 60_000 && delta <= 30 * 60_000)
        .sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0]?.event;
      result.set(lead.id, sourceLabel(matched?.page_source));
    }
  } catch (error) {
    console.error("[admin-leads] source enrichment failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }

  return result;
}

export const listAdminLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminLeadRow[]> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בפניות.");

    const leads = await loadAllLeads();
    const sourceMap = await loadSourceMap(leads);

    return leads.map((lead) => {
      const therapist = firstJoin<JoinedTherapist>(lead.therapists);
      const channel = adminChannel(lead.delivery_channel);
      return {
        id: lead.id,
        createdAt: lead.created_at,
        therapistId: lead.therapist_id,
        therapistName: therapist.full_name ?? "מטפל/ת",
        channel,
        source: sourceMap.get(lead.id) ?? "לא ידוע",
        status: adminStatus(lead.delivery_status, channel),
        deliveryStatus: lead.delivery_status,
        workflowStatus: workflowStatus(lead.therapist_status),
        workflowUpdatedAt: lead.therapist_updated_at,
        ctaEventId: lead.cta_event_id,
        providerMessageId: lead.provider_message_id,
      };
    });
  });
