import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AccountActivityChannel } from "./account-activity.functions";

export const LEAD_WORKFLOW_STATUSES = ["new", "in_progress", "handled", "archived"] as const;
export type LeadWorkflowStatus = (typeof LEAD_WORKFLOW_STATUSES)[number];

export type AccountLeadDetail = {
  id: string;
  created_at: string;
  channel: AccountActivityChannel;
  delivery_status: string;
  workflow_status: LeadWorkflowStatus;
  visitor_name: string | null;
  visitor_phone: string | null;
  message: string;
  problem_name: string | null;
  population_name: string | null;
  private_note: string | null;
  updated_at: string | null;
  charge_agorot: number;
};

const LeadIdSchema = z.object({ leadId: z.string().uuid() });
const UpdateLeadSchema = LeadIdSchema.extend({
  workflowStatus: z.enum(LEAD_WORKFLOW_STATUSES),
  privateNote: z.string().trim().max(2000).nullable(),
});

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("לא ניתן לקרוא את פרטי הפנייה.");
  return value as Record<string, unknown>;
}

function parseDetail(value: unknown): AccountLeadDetail {
  const row = asObject(value);
  const channel: AccountActivityChannel =
    row.channel === "whatsapp" || row.channel === "phone" || row.channel === "email"
      ? row.channel
      : "other";
  const workflowStatus: LeadWorkflowStatus = LEAD_WORKFLOW_STATUSES.includes(
    row.workflow_status as LeadWorkflowStatus,
  )
    ? (row.workflow_status as LeadWorkflowStatus)
    : "new";
  return {
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    channel,
    delivery_status: String(row.delivery_status ?? "pending"),
    workflow_status: workflowStatus,
    visitor_name: typeof row.visitor_name === "string" ? row.visitor_name : null,
    visitor_phone: typeof row.visitor_phone === "string" ? row.visitor_phone : null,
    message: String(row.message ?? ""),
    problem_name: typeof row.problem_name === "string" ? row.problem_name : null,
    population_name: typeof row.population_name === "string" ? row.population_name : null,
    private_note: typeof row.private_note === "string" ? row.private_note : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    charge_agorot: Number(row.charge_agorot) || 0,
  };
}

export const getMyAccountLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LeadIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<AccountLeadDetail> => {
    const { data: detail, error } = await context.supabase.rpc("get_my_account_lead_detail", {
      _lead_id: data.leadId,
    });
    if (error) throw new Error(error.message);
    return parseDetail(detail);
  });

export const updateMyAccountLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateLeadSchema.parse(input))
  .handler(async ({ data, context }): Promise<AccountLeadDetail> => {
    const { data: detail, error } = await context.supabase.rpc("update_my_account_lead", {
      _lead_id: data.leadId,
      _workflow_status: data.workflowStatus,
      _private_note: data.privateNote ?? (null as unknown as string),
    });
    if (error) throw new Error(error.message);
    return parseDetail(detail);
  });
