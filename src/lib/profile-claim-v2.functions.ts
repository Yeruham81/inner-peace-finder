import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PublicRequestSchema = z.object({
  therapistId: z.string().uuid(),
  requestType: z.enum(["claim_profile", "remove_profile"]),
  requesterName: z.string().trim().min(2).max(120),
  requesterEmail: z.string().trim().email().max(180),
  requesterPhone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(1000).optional(),
});

const TokenSchema = z.object({ token: z.string().trim().min(32).max(512) });

export type ProfileRequestType = "claim_profile" | "remove_profile";

export type ClaimInvitePreview = {
  valid: boolean;
  therapistId: string | null;
  therapistName: string | null;
  professionalTitle: string | null;
  expiresAt: string | null;
  emailMatchesSignedInUser: boolean;
  maskedEmail: string | null;
};

async function hashToken(token: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

async function signedInEmail(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user?.email ? normalizeEmail(data.user.email) : null;
}

async function ensureAccount(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing, error: readError } = await supabase
    .from("therapist_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("therapist_accounts")
    .insert({ auth_user_id: userId })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return created.id;
}

/**
 * Public signal from an unclaimed profile. This never proves identity and
 * never transfers ownership. The supplied email/phone are contact details for
 * follow-up only; an eventual invite must target a contact address that was
 * already stored on the therapist profile before this request.
 */
export const submitPublicProfileRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PublicRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deriveRequestIdentity } = await import("./lead-challenge.server");
    const request = getRequest();
    const { ipHash } = deriveRequestIdentity(request?.headers);

    const { data: therapist, error: therapistError } = await supabaseAdmin
      .from("therapists")
      .select("id, owner_account_id, profile_origin, do_not_republish, is_active")
      .eq("id", data.therapistId)
      .maybeSingle();
    if (therapistError) throw new Error(therapistError.message);
    if (
      !therapist ||
      therapist.owner_account_id ||
      therapist.profile_origin !== "admin_public_info" ||
      therapist.do_not_republish ||
      !therapist.is_active
    ) {
      return { ok: false as const, reason: "profile_not_requestable" as const };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: rateError } = await supabaseAdmin
      .from("therapist_profile_requests")
      .select("id", { count: "exact", head: true })
      .eq("request_ip_hash", ipHash)
      .gte("created_at", since);
    if (rateError) throw new Error(rateError.message);
    if ((count ?? 0) >= 5) {
      return { ok: false as const, reason: "rate_limited" as const };
    }

    const { data: row, error } = await supabaseAdmin
      .from("therapist_profile_requests")
      .insert({
        therapist_id: data.therapistId,
        request_type: data.requestType,
        requester_name: data.requesterName,
        requester_email: normalizeEmail(data.requesterEmail),
        requester_phone: data.requesterPhone?.trim() || null,
        note: data.note?.trim() || null,
        request_ip_hash: ipHash,
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      return { ok: true as const, requestId: null, alreadyExists: true as const };
    }
    if (error) throw new Error(error.message);

    return { ok: true as const, requestId: row.id, alreadyExists: false as const };
  });

export const getClaimInvitePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClaimInvitePreview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await signedInEmail(context.supabase);
    const tokenHash = await hashToken(data.token);

    const { data: invite, error } = await supabaseAdmin
      .from("therapist_claim_invites")
      .select("therapist_id, email, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const expired = !invite || invite.status !== "pending" || new Date(invite.expires_at).getTime() <= Date.now();
    if (expired || !invite) {
      return {
        valid: false,
        therapistId: null,
        therapistName: null,
        professionalTitle: null,
        expiresAt: null,
        emailMatchesSignedInUser: false,
        maskedEmail: null,
      };
    }

    const { data: therapist, error: therapistError } = await supabaseAdmin
      .from("therapists")
      .select("full_name, professional_title")
      .eq("id", invite.therapist_id)
      .maybeSingle();
    if (therapistError) throw new Error(therapistError.message);

    return {
      valid: true,
      therapistId: invite.therapist_id,
      therapistName: therapist?.full_name ?? null,
      professionalTitle: therapist?.professional_title ?? null,
      expiresAt: invite.expires_at,
      emailMatchesSignedInUser: !!email && email === normalizeEmail(invite.email),
      maskedEmail: maskEmail(invite.email),
    };
  });

const HELD_LEAD_RELEASE_WINDOW_HOURS = 72;

export const acceptClaimInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = await signedInEmail(context.supabase);
    if (!email) throw new Error("לא נמצאה כתובת אימייל מאומתת בחשבון.");
    await ensureAccount(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: therapistId, error } = await supabaseAdmin.rpc("claim_therapist_by_invite", {
      _token_hash: await hashToken(data.token),
      _auth_user_id: context.userId,
      _verified_email: email,
    });
    if (error) throw new Error(error.message);
    if (!therapistId) throw new Error("לא ניתן לשייך את הפרופיל לחשבון.");

    // If a visitor used the single initial-contact allowance before the
    // therapist claimed the profile, release that held inquiry only now.
    // Claiming the profile is the therapist's explicit participation signal.
    const { data: therapist, error: therapistError } = await supabaseAdmin
      .from("therapists")
      .select("full_name, email")
      .eq("id", therapistId)
      .single();
    if (therapistError) throw new Error(therapistError.message);

    const { data: heldLeads, error: leadError } = await supabaseAdmin
      .from("lead_events")
      .select("id, visitor_name, visitor_phone, message, created_at")
      .eq("therapist_id", therapistId)
      .eq("delivery_status", "awaiting_consent")
      .order("created_at", { ascending: true })
      .limit(1);
    if (leadError) throw new Error(leadError.message);

    let releasedLead = false;
    let expiredHeldLead = false;
    const heldLead = heldLeads?.[0];
    if (heldLead) {
      const createdAtMs = new Date(heldLead.created_at).getTime();
      const maxAgeMs = HELD_LEAD_RELEASE_WINDOW_HOURS * 60 * 60 * 1000;
      const isFresh = Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= maxAgeMs;

      if (!isFresh) {
        const { error: expiryError } = await supabaseAdmin
          .from("lead_events")
          .update({ delivery_status: "expired_before_consent" })
          .eq("id", heldLead.id)
          .eq("delivery_status", "awaiting_consent");
        if (expiryError) {
          console.error("[claim] held lead expiry status update failed", { leadId: heldLead.id, code: expiryError.code });
        }
        expiredHeldLead = true;
      } else if (therapist.email) {
        const { dispatchLead } = await import("./lead-delivery.server");
        const delivery = await dispatchLead("email", therapist.email, {
          visitorName: heldLead.visitor_name,
          visitorPhone: heldLead.visitor_phone,
          message: heldLead.message,
          therapistName: therapist.full_name,
        });
        const { error: statusError } = await supabaseAdmin
          .from("lead_events")
          .update({
            delivery_status: delivery.status,
            provider_message_id: delivery.providerMessageId ?? null,
          })
          .eq("id", heldLead.id)
          .eq("delivery_status", "awaiting_consent");
        if (statusError) {
          console.error("[claim] held lead status update failed", { leadId: heldLead.id, code: statusError.code });
        }
        releasedLead = delivery.status === "sent";
      }
    }

    return { ok: true as const, therapistId, releasedLead, expiredHeldLead };
  });
