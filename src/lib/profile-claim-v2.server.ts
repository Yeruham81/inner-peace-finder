import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Server-only helper for the future authenticated admin workflow.
 * It deliberately does not send email: provider delivery stays in the
 * integrations phase. The returned URL can be handed to the mailer later.
 */
export async function createClaimInviteForTherapist(input: {
  therapistId: string;
  creatorUserId: string;
  origin: string;
  ttlHours?: number;
}) {
  const { data: therapist, error: therapistError } = await supabaseAdmin
    .from("therapists")
    .select("email, full_name, owner_account_id, profile_origin, do_not_republish")
    .eq("id", input.therapistId)
    .single();
  if (therapistError) throw new Error(therapistError.message);
  if (therapist.owner_account_id || therapist.profile_origin !== "admin_public_info" || therapist.do_not_republish) {
    throw new Error("Profile is not claimable");
  }
  if (!therapist.email) throw new Error("Profile has no pre-existing email for verification");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? 168) * 60 * 60 * 1000).toISOString();
  const { data: invite, error } = await supabaseAdmin.rpc("create_therapist_claim_invite", {
    _therapist_id: input.therapistId,
    _email: therapist.email,
    _token_hash: await hashToken(token),
    _created_by: input.creatorUserId,
    _expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  if (!invite) throw new Error("Claim invite was not created");

  const origin = input.origin.replace(/\/$/, "");
  return {
    inviteId: invite.id,
    therapistName: therapist.full_name,
    email: therapist.email,
    expiresAt,
    claimUrl: `${origin}/claim?token=${encodeURIComponent(token)}`,
  };
}

/** Call only after the invitation message was actually accepted by the mail provider. */
export async function markClaimInviteAsSent(inviteId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("mark_therapist_claim_invite_sent", { _invite_id: inviteId });
  if (error) throw new Error(error.message);
}
