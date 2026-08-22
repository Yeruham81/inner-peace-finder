import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminClaimRow = {
  id: string;
  kind: "invite" | "claim_request" | "removal_request";
  therapistId: string;
  therapistName: string;
  professionalTitle: string | null;
  profileEmail: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  status:
    | "invite_pending"
    | "invite_sent"
    | "invite_failed"
    | "invite_accepted"
    | "invite_expired"
    | "invite_revoked"
    | "request_pending"
    | "request_approved"
    | "request_rejected";
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  sourceLeadId: string | null;
  providerMessageId: string | null;
  lastDeliveryError: string | null;
  verificationMethod: string | null;
};

function hasAdminClaim(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const appMetadata = (claims as { app_metadata?: unknown }).app_metadata;
  return Boolean(
    appMetadata &&
    typeof appMetadata === "object" &&
    (appMetadata as { tipulinks_role?: unknown }).tipulinks_role === "admin",
  );
}

function requireAdmin(claims: unknown): void {
  if (!hasAdminClaim(claims)) throw new Error("אין הרשאת מנהל לניהול בקשות בעלות.");
}

type TherapistJoin = {
  full_name?: string | null;
  professional_title?: string | null;
  email?: string | null;
};

function joinedTherapist(value: unknown): TherapistJoin {
  if (Array.isArray(value)) return (value[0] ?? {}) as TherapistJoin;
  return (value ?? {}) as TherapistJoin;
}

export const listAdminClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminClaimRow[]> => {
    requireAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [inviteResult, requestResult] = await Promise.all([
      supabaseAdmin
        .from("therapist_claim_invites")
        .select(
          "id, therapist_id, email, status, expires_at, sent_at, accepted_at, created_at, source_lead_id, delivery_status, provider_message_id, last_delivery_error, therapists:therapist_id(full_name, professional_title, email)",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("therapist_profile_requests")
        .select(
          "id, therapist_id, request_type, requester_name, requester_email, requester_phone, note, review_note, status, verification_method, created_at, therapists:therapist_id(full_name, professional_title, email)",
        )
        .order("created_at", { ascending: false }),
    ]);
    if (inviteResult.error) throw new Error(inviteResult.error.message);
    if (requestResult.error) throw new Error(requestResult.error.message);

    const now = Date.now();
    const invites: AdminClaimRow[] = (inviteResult.data ?? []).map((raw) => {
      const row = raw as typeof raw & { therapists?: unknown };
      const therapist = joinedTherapist(row.therapists);
      const expired = row.status === "pending" && new Date(row.expires_at).getTime() <= now;
      const status: AdminClaimRow["status"] =
        row.status === "accepted"
          ? "invite_accepted"
          : expired || row.status === "expired"
            ? "invite_expired"
            : row.delivery_status === "failed"
              ? "invite_failed"
              : row.status === "revoked"
                ? "invite_revoked"
                : row.delivery_status === "sent"
                  ? "invite_sent"
                  : "invite_pending";
      return {
        id: row.id,
        kind: "invite",
        therapistId: row.therapist_id,
        therapistName: therapist.full_name ?? "מטפל/ת",
        professionalTitle: therapist.professional_title ?? null,
        profileEmail: therapist.email ?? row.email,
        requesterName: null,
        requesterEmail: null,
        requesterPhone: null,
        requestNote: null,
        reviewNote: null,
        status,
        createdAt: row.created_at,
        sentAt: row.sent_at,
        acceptedAt: row.accepted_at,
        expiresAt: row.expires_at,
        sourceLeadId: row.source_lead_id,
        providerMessageId: row.provider_message_id,
        lastDeliveryError: row.last_delivery_error,
        verificationMethod: null,
      };
    });

    const requests: AdminClaimRow[] = (requestResult.data ?? []).map((raw) => {
      const row = raw as typeof raw & { therapists?: unknown };
      const therapist = joinedTherapist(row.therapists);
      const status: AdminClaimRow["status"] =
        row.status === "approved"
          ? "request_approved"
          : row.status === "rejected"
            ? "request_rejected"
            : "request_pending";
      return {
        id: row.id,
        kind: row.request_type === "remove_profile" ? "removal_request" : "claim_request",
        therapistId: row.therapist_id,
        therapistName: therapist.full_name ?? "מטפל/ת",
        professionalTitle: therapist.professional_title ?? null,
        profileEmail: therapist.email ?? null,
        requesterName: row.requester_name,
        requesterEmail: row.requester_email,
        requesterPhone: row.requester_phone,
        requestNote: row.note,
        reviewNote: row.review_note,
        status,
        createdAt: row.created_at,
        sentAt: null,
        acceptedAt: null,
        expiresAt: null,
        sourceLeadId: null,
        providerMessageId: null,
        lastDeliveryError: null,
        verificationMethod: row.verification_method,
      };
    });

    return [...invites, ...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

const SendInviteSchema = z.object({
  therapistId: z.string().uuid(),
  sourceLeadId: z.string().uuid().nullable().optional(),
});

export const resendAdminClaimInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAdmin(context.claims);
    const { sendClaimInvitation } = await import("./profile-claim-v2.server");
    const result = await sendClaimInvitation({
      therapistId: data.therapistId,
      creatorUserId: context.userId,
      sourceLeadId: data.sourceLeadId ?? null,
      inviteSource: "admin_resend",
      replaceExisting: true,
    });
    if (result.status === "failed") throw new Error(`שליחת ההזמנה נכשלה: ${result.error}`);
    if (result.status !== "sent") throw new Error("ההזמנה לא נשלחה. נסו שוב.");
    return result;
  });

const ReviewRequestSchema = z.object({
  requestId: z.string().uuid(),
  verificationMethod: z
    .enum(["existing_email", "existing_phone", "manual_review"])
    .default("manual_review"),
});

export const approveAdminRemovalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: therapistId, error } = await supabaseAdmin.rpc(
      "approve_therapist_profile_removal",
      {
        _request_id: data.requestId,
        _reviewer: context.userId,
        _verification_method: data.verificationMethod,
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, therapistId };
  });

const RejectRequestSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export const rejectAdminProfileRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RejectRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("therapist_profile_requests")
      .update({
        status: "rejected",
        review_note: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("הבקשה אינה ממתינה לבדיקה.");
    return { ok: true as const };
  });
