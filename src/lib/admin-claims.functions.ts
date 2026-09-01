import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";

export type AdminClaimKind = "invite" | "claim_request" | "removal_request";
export type AdminClaimStatus =
  | "invite_pending"
  | "invite_sent"
  | "invite_failed"
  | "invite_accepted"
  | "invite_expired"
  | "invite_revoked"
  | "request_pending"
  | "request_verification_pending"
  | "request_approved"
  | "request_rejected"
  | "request_cancelled";
export type AdminOwnershipVerificationCategory = "email" | "phone" | "manual_review" | "unverified";
export type AdminClaimSortKey =
  | "priority"
  | "therapistName"
  | "requesterEmail"
  | "verificationMethod"
  | "createdAt"
  | "status"
  | "resolvedAt"
  | "kind";

export type AdminClaimRow = {
  id: string;
  kind: AdminClaimKind;
  therapistId: string;
  therapistName: string;
  therapistSlug: string | null;
  professionalTitle: string | null;
  profileEmail: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  status: AdminClaimStatus;
  createdAt: string;
  resolvedAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  sourceLeadId: string | null;
  providerMessageId: string | null;
  lastDeliveryError: string | null;
  verificationMethod: string | null;
  verificationCategory: AdminOwnershipVerificationCategory;
  ownerAccountId: string | null;
  profileClaimed: boolean;
  profileStatus: string;
  visibility: string;
  isActive: boolean;
  doNotRepublish: boolean;
  profileOwnershipVerificationMethod: string | null;
  profileOwnershipVerifiedAt: string | null;
  activeProfileInvite: boolean;
};

export type AdminClaimsPage = {
  rows: AdminClaimRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const CLAIM_STATUSES = [
  "invite_pending",
  "invite_sent",
  "invite_failed",
  "invite_accepted",
  "invite_expired",
  "invite_revoked",
  "request_pending",
  "request_verification_pending",
  "request_approved",
  "request_rejected",
  "request_cancelled",
] as const;

const ListAdminClaimsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]).default(25),
  search: z.string().trim().max(200).default(""),
  kind: z.enum(["invite", "claim_request", "removal_request"]).nullable().optional(),
  status: z.enum(CLAIM_STATUSES).nullable().optional(),
  verificationCategory: z.enum(["email", "phone", "manual_review", "unverified"]).nullable().optional(),
  ageDays: z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .nullable()
    .optional(),
  sortKey: z
    .enum([
      "priority",
      "therapistName",
      "requesterEmail",
      "verificationMethod",
      "createdAt",
      "status",
      "resolvedAt",
      "kind",
    ])
    .default("priority"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

const SORT_COLUMNS: Record<AdminClaimSortKey, string> = {
  priority: "attention_rank",
  therapistName: "therapist_name",
  requesterEmail: "requester_email",
  verificationMethod: "verification_category",
  createdAt: "created_at",
  status: "status",
  resolvedAt: "resolved_at",
  kind: "kind",
};

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function asKind(value: string | null): AdminClaimKind {
  if (value === "invite" || value === "claim_request" || value === "removal_request") return value;
  throw new Error("סוג בקשה לא מוכר התקבל מהשרת.");
}

function asStatus(value: string | null): AdminClaimStatus {
  if (value && (CLAIM_STATUSES as readonly string[]).includes(value)) return value as AdminClaimStatus;
  throw new Error("סטטוס בקשה לא מוכר התקבל מהשרת.");
}

function asVerificationCategory(value: string | null): AdminOwnershipVerificationCategory {
  if (value === "email" || value === "phone" || value === "manual_review" || value === "unverified") return value;
  return "unverified";
}

function requiredString(value: string | null, field: string): string {
  if (!value) throw new Error(`חסר שדה חובה ברשומת בקשה: ${field}`);
  return value;
}

export const listAdminClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListAdminClaimsSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminClaimsPage> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בבקשות בעלות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("admin_profile_claims")
      .select(
        "id, kind, therapist_id, therapist_name, therapist_slug, professional_title, profile_email, requester_name, requester_email, requester_phone, request_note, review_note, reviewed_by, status, created_at, resolved_at, sent_at, accepted_at, expires_at, revoked_at, source_lead_id, provider_message_id, last_delivery_error, verification_method, verification_category, owner_account_id, profile_claimed, profile_status, visibility, is_active, do_not_republish, profile_ownership_verification_method, profile_ownership_verified_at",
        { count: "exact" },
      );

    if (data.search) {
      query = query.ilike("search_text", `%${escapeLikePattern(data.search)}%`);
    }
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.status) query = query.eq("status", data.status);
    if (data.verificationCategory) query = query.eq("verification_category", data.verificationCategory);
    if (data.ageDays) {
      const createdAfter = new Date(Date.now() - data.ageDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", createdAfter);
    }

    const sortColumn = SORT_COLUMNS[data.sortKey];
    const ascending = data.sortDirection === "asc";
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let orderedQuery = query.order(sortColumn, { ascending, nullsFirst: false });
    if (data.sortKey === "priority") {
      orderedQuery = orderedQuery.order("created_at", { ascending: true }).order("id", { ascending: true });
    } else {
      orderedQuery = orderedQuery.order("id", { ascending: true });
    }

    const result = await orderedQuery.range(from, to);
    if (result.error) throw new Error(result.error.message);

    const rawRows = result.data ?? [];
    const therapistIds = [
      ...new Set(
        rawRows
          .filter(
            (row) =>
              row.kind === "claim_request" &&
              (row.status === "request_pending" || row.status === "request_verification_pending"),
          )
          .map((row) => row.therapist_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const activeInviteTherapistIds = new Set<string>();
    if (therapistIds.length > 0) {
      const { data: activeInvites, error: inviteError } = await supabaseAdmin
        .from("therapist_claim_invites")
        .select("therapist_id")
        .in("therapist_id", therapistIds)
        .eq("status", "pending")
        .eq("delivery_status", "sent")
        .gt("expires_at", new Date().toISOString());
      if (inviteError) throw new Error(inviteError.message);
      for (const invite of activeInvites ?? []) activeInviteTherapistIds.add(invite.therapist_id);
    }

    const rows: AdminClaimRow[] = rawRows.map((row) => ({
      id: requiredString(row.id, "id"),
      kind: asKind(row.kind),
      therapistId: requiredString(row.therapist_id, "therapist_id"),
      therapistName: row.therapist_name ?? "מטפל/ת",
      therapistSlug: row.therapist_slug,
      professionalTitle: row.professional_title,
      profileEmail: row.profile_email,
      requesterName: row.requester_name,
      requesterEmail: row.requester_email,
      requesterPhone: row.requester_phone,
      requestNote: row.request_note,
      reviewNote: row.review_note,
      reviewedBy: row.reviewed_by,
      status: asStatus(row.status),
      createdAt: requiredString(row.created_at, "created_at"),
      resolvedAt: row.resolved_at,
      sentAt: row.sent_at,
      acceptedAt: row.accepted_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      sourceLeadId: row.source_lead_id,
      providerMessageId: row.provider_message_id,
      lastDeliveryError: row.last_delivery_error,
      verificationMethod: row.verification_method,
      verificationCategory: asVerificationCategory(row.verification_category),
      ownerAccountId: row.owner_account_id,
      profileClaimed: Boolean(row.profile_claimed),
      profileStatus: row.profile_status ?? "draft",
      visibility: row.visibility ?? "",
      isActive: Boolean(row.is_active),
      doNotRepublish: Boolean(row.do_not_republish),
      profileOwnershipVerificationMethod: row.profile_ownership_verification_method,
      profileOwnershipVerifiedAt: row.profile_ownership_verified_at,
      activeProfileInvite:
        row.kind === "claim_request" && row.therapist_id ? activeInviteTherapistIds.has(row.therapist_id) : false,
    }));

    const total = result.count ?? 0;
    return {
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
      pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
    };
  });

const ClaimRequestIdSchema = z.object({ requestId: z.string().uuid() });

/**
 * Admin approval never transfers ownership directly. It authorizes the
 * canonical professional-email invitation; ownership is transferred only when
 * the invite is accepted by an account with the verified matching email.
 */
export const approveAdminClaimRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClaimRequestIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לאישור בקשות בעלות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request, error } = await supabaseAdmin
      .from("therapist_profile_requests")
      .update({ reviewed_by: context.userId })
      .eq("id", data.requestId)
      .eq("request_type", "claim_profile")
      .eq("status", "pending")
      .is("reviewed_by", null)
      .select("id, therapist_id, request_type, status")
      .maybeSingle();
    if (error?.code === "23505") {
      throw new Error("קיימת כבר בקשת בעלות אחרת לפרופיל שנמצאת בתהליך אימות.");
    }
    if (error) throw new Error(error.message);
    if (!request) throw new Error("בקשת הבעלות אינה ממתינה לבדיקה או שכבר נמצאת בתהליך אימות.");

    const releaseReviewReservation = async () => {
      await supabaseAdmin
        .from("therapist_profile_requests")
        .update({ reviewed_by: null })
        .eq("id", request.id)
        .eq("status", "pending")
        .eq("reviewed_by", context.userId);
    };

    let newlySentInviteId: string | null = null;
    try {
      const { data: activeInvite, error: activeInviteError } = await supabaseAdmin
        .from("therapist_claim_invites")
        .select("id")
        .eq("therapist_id", request.therapist_id)
        .eq("status", "pending")
        .eq("delivery_status", "sent")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (activeInviteError) throw new Error(activeInviteError.message);

      const { sendClaimInvitation } = await import("./profile-claim-v2.server");
      const result = activeInvite
        ? { status: "already_pending" as const, inviteId: activeInvite.id, providerMessageId: null }
        : await sendClaimInvitation({
            therapistId: request.therapist_id,
            creatorUserId: context.userId,
            inviteSource: "profile_request",
            // No delivered invite exists. Replacing a stale/failed/unsent
            // pending row is safe and avoids treating it as active verification.
            replaceExisting: true,
          });

      if (result.status === "failed") {
        throw new Error(`שליחת הזמנת האימות נכשלה: ${result.error}`);
      }
      if (result.status === "sent") newlySentInviteId = result.inviteId;

      // Re-check the reservation after external email delivery. If another
      // admin finalized/rejected the request while Brevo was being called,
      // revoke the newly-created token before returning so it cannot be used.
      const { data: stillReserved, error: reservationError } = await supabaseAdmin
        .from("therapist_profile_requests")
        .select("id")
        .eq("id", request.id)
        .eq("status", "pending")
        .eq("reviewed_by", context.userId)
        .maybeSingle();
      if (reservationError) throw new Error(reservationError.message);
      if (!stillReserved) throw new Error("בקשת הבעלות טופלה במקביל על ידי מנהל אחר.");

      // Keep reviewed_by set for both a newly-sent invite and a pre-existing
      // valid invite. That marks this specific public request as explicitly
      // advanced by an admin; invite acceptance can then approve this request
      // without falsely approving unrelated pending requests for the profile.
      newlySentInviteId = null;
      return {
        ok: true as const,
        invitationStatus: result.status,
        inviteId: result.inviteId,
      };
    } catch (error) {
      if (newlySentInviteId) {
        await supabaseAdmin
          .from("therapist_claim_invites")
          .update({ status: "revoked", revoked_at: new Date().toISOString() })
          .eq("id", newlySentInviteId)
          .eq("status", "pending");
      }
      await releaseReviewReservation();
      throw error;
    }
  });

const SendInviteSchema = z.object({
  therapistId: z.string().uuid(),
  sourceLeadId: z.string().uuid().nullable().optional(),
});

export const resendAdminClaimInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשליחת הזמנות בעלות.");
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

const ReviewRemovalSchema = z.object({
  requestId: z.string().uuid(),
  verificationMethod: z.enum(["existing_email", "existing_phone", "manual_review"]).default("manual_review"),
});

export const approveAdminRemovalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewRemovalSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לאישור בקשות הסרה.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: therapistId, error } = await supabaseAdmin.rpc("approve_therapist_profile_removal", {
      _request_id: data.requestId,
      _reviewer: context.userId,
      _verification_method: data.verificationMethod,
    });
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
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לדחיית בקשות פרופיל.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request, error: readError } = await supabaseAdmin
      .from("therapist_profile_requests")
      .select("id, therapist_id, request_type, status, reviewed_by")
      .eq("id", data.requestId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!request || request.status !== "pending") throw new Error("הבקשה אינה ממתינה לבדיקה.");

    if (request.request_type === "claim_profile" && request.reviewed_by) {
      const { error: revokeError } = await supabaseAdmin
        .from("therapist_claim_invites")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("therapist_id", request.therapist_id)
        .eq("status", "pending")
        .in("invite_source", ["profile_request", "admin_resend"]);
      if (revokeError) throw new Error(revokeError.message);
    }

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
    if (!row) throw new Error("הבקשה כבר טופלה על ידי פעולה אחרת.");
    return { ok: true as const };
  });
