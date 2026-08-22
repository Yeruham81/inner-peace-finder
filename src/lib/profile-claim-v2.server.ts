import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ClaimInviteSource = "first_lead" | "profile_request" | "admin_resend" | "manual";

export type ClaimInviteDeliveryResult =
  | { status: "sent"; inviteId: string; providerMessageId: string | null }
  | { status: "already_pending"; inviteId: string | null; providerMessageId: null }
  | { status: "failed"; inviteId: string | null; providerMessageId: null; error: string };

type ClaimInvite = {
  inviteId: string;
  therapistId: string;
  therapistName: string;
  therapistSlug: string;
  email: string;
  expiresAt: string;
  claimUrl: string;
  profileUrl: string;
};

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicOrigin(): string {
  const configured = process.env.TIPULINKS_PUBLIC_ORIGIN || "https://tipulinks.co.il";
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("TIPULINKS_PUBLIC_ORIGIN must use https");
  }
  return parsed.origin;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inviteEmailHtml(invite: ClaimInvite): string {
  const name = escapeHtml(invite.therapistName);
  const claimUrl = escapeHtml(invite.claimUrl);
  const profileUrl = escapeHtml(invite.profileUrl);
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18302b;line-height:1.75">
    <h1 style="font-size:24px;margin:0 0 16px">התקבלה פנייה חדשה עבורך בטיפולינקס</h1>
    <p>שלום ${name},</p>
    <p>יש לך פנייה ממשתמש/ת שראה את הפרופיל שלך באתר טיפולינקס ומעוניין/ת ליצור איתך קשר לגבי טיפול.</p>
    <p>הפרופיל המקצועי שיצרנו עבורך באתר מבוסס כרגע על מידע פומבי בלבד.</p>
    <p>אנחנו מזמינים אותך לקחת בעלות על הפרופיל שלך, לעדכן את פרטיו ולקבל את הפנייה שמחכה לך.</p>
    <p>כדי להשלים את התהליך עליך לאמת את כתובת האימייל:</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${claimUrl}" style="display:inline-block;background:#2d8074;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700">קבלת בעלות על הפרופיל</a>
    </p>
    <p style="font-size:14px;color:#52645f">הקישור הינו אישי, תקף לזמן מוגבל וניתן לפתיחה רק מהכתובת שאליה נשלחה הודעה זו.</p>
    <hr style="border:0;border-top:1px solid #dce8e4;margin:28px 0" />
    <p style="font-size:13px;color:#687873">אינך מעוניין/ת להופיע באתר? ניתן להיכנס <a href="${profileUrl}" style="color:#2d8074">לעמוד הפרופיל</a> ולבקש להסיר אותו.</p>
  </div>`;
}

async function deliverClaimInvite(invite: ClaimInvite): Promise<{ providerMessageId: string | null }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("brevo_not_configured");

  const senderName = process.env.EMAIL_FROM_NAME || "Tipulinks";
  const senderEmail = process.env.EMAIL_FROM_ADDRESS || "notifications@tipulinks.co.il";
  const templateIdRaw = process.env.BREVO_CLAIM_INVITE_TEMPLATE_ID;
  const templateId = templateIdRaw ? Number(templateIdRaw) : null;
  if (templateIdRaw && (!Number.isInteger(templateId) || (templateId ?? 0) <= 0)) {
    throw new Error("invalid_brevo_claim_invite_template_id");
  }

  const body = templateId
    ? {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: invite.email, name: invite.therapistName }],
        templateId,
        params: {
          therapist_name: invite.therapistName,
          claim_url: invite.claimUrl,
          profile_url: invite.profileUrl,
          expires_at: invite.expiresAt,
        },
      }
    : {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: invite.email, name: invite.therapistName }],
        subject: "התקבלה פנייה חדשה עבורך בטיפולינקס",
        htmlContent: inviteEmailHtml(invite),
      };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as {
    messageId?: string;
    messageIds?: string[];
    message?: string;
  } | null;
  if (!response.ok) throw new Error(json?.message ?? `brevo_${response.status}`);
  return { providerMessageId: json?.messageId ?? json?.messageIds?.[0] ?? null };
}

export async function createClaimInviteForTherapist(input: {
  therapistId: string;
  creatorUserId?: string | null;
  sourceLeadId?: string | null;
  inviteSource: ClaimInviteSource;
  replaceExisting?: boolean;
  ttlHours?: number;
}): Promise<ClaimInvite> {
  const { data: therapist, error: therapistError } = await supabaseAdmin
    .from("therapists")
    .select("email, full_name, slug, owner_account_id, profile_origin, do_not_republish")
    .eq("id", input.therapistId)
    .single();
  if (therapistError) throw new Error(therapistError.message);
  if (therapist.owner_account_id || therapist.profile_origin !== "admin_public_info" || therapist.do_not_republish) {
    throw new Error("Profile is not claimable");
  }
  if (!therapist.email) throw new Error("Profile has no professional email");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? 168) * 60 * 60 * 1000).toISOString();
  const { data: invite, error } = await supabaseAdmin.rpc("create_therapist_claim_invite", {
    _therapist_id: input.therapistId,
    _email: therapist.email,
    _token_hash: await hashToken(token),
    _created_by: input.creatorUserId ?? (null as unknown as string),
    _expires_at: expiresAt,
    _source_lead_id: input.sourceLeadId ?? (null as unknown as string),
    _invite_source: input.inviteSource,
    _replace_existing: input.replaceExisting ?? false,
  });
  if (error) throw new Error(error.message);
  if (!invite) throw new Error("Claim invite was not created");

  const origin = publicOrigin();
  return {
    inviteId: invite.id,
    therapistId: input.therapistId,
    therapistName: therapist.full_name,
    therapistSlug: therapist.slug,
    email: therapist.email,
    expiresAt,
    claimUrl: `${origin}/claim?token=${encodeURIComponent(token)}`,
    profileUrl: `${origin}/therapists/${encodeURIComponent(therapist.slug)}`,
  };
}

export async function sendClaimInvitation(input: {
  therapistId: string;
  creatorUserId?: string | null;
  sourceLeadId?: string | null;
  inviteSource: ClaimInviteSource;
  replaceExisting?: boolean;
}): Promise<ClaimInviteDeliveryResult> {
  let invite: ClaimInvite;
  try {
    invite = await createClaimInviteForTherapist(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invite_creation_failed";
    if (message.includes("pending invite already exists")) {
      const { data: existing } = await supabaseAdmin
        .from("therapist_claim_invites")
        .select("id, delivery_status")
        .eq("therapist_id", input.therapistId)
        .eq("status", "pending")
        .maybeSingle();
      // A process can stop after storing the hash but before calling Brevo. The
      // plaintext token is intentionally unrecoverable, so replace only that
      // unsent row. A delivered pending invite must never generate duplicates.
      if (existing?.delivery_status === "pending" && !input.replaceExisting) {
        return sendClaimInvitation({ ...input, replaceExisting: true });
      }
      return { status: "already_pending", inviteId: existing?.id ?? null, providerMessageId: null };
    }
    return { status: "failed", inviteId: null, providerMessageId: null, error: message };
  }

  let delivered: { providerMessageId: string | null };
  try {
    delivered = await deliverClaimInvite(invite);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invite_delivery_failed";
    const { error: markError } = await supabaseAdmin.rpc("mark_therapist_claim_invite_failed", {
      _invite_id: invite.inviteId,
      _error: message,
    });
    if (markError) {
      console.error("[claim-invite] failed to persist delivery failure", {
        inviteId: invite.inviteId,
        code: markError.code,
      });
    }
    return { status: "failed", inviteId: invite.inviteId, providerMessageId: null, error: message };
  }

  const { error: markSentError } = await supabaseAdmin.rpc("mark_therapist_claim_invite_sent", {
    _invite_id: invite.inviteId,
    _provider_message_id: delivered.providerMessageId ?? (null as unknown as string),
  });
  if (markSentError) {
    // Brevo has already accepted the message. Do not revoke its token or mark
    // delivery as failed; that would invalidate a link already in the inbox.
    console.error("[claim-invite] Brevo accepted message but sent state was not persisted", {
      inviteId: invite.inviteId,
      providerMessageId: delivered.providerMessageId,
      code: markSentError.code,
    });
    return {
      status: "failed",
      inviteId: invite.inviteId,
      providerMessageId: null,
      error: "claim_invite_delivery_state_not_persisted",
    };
  }

  return {
    status: "sent",
    inviteId: invite.inviteId,
    providerMessageId: delivered.providerMessageId,
  };
}

export async function sendInitialClaimInvitationForLead(input: {
  therapistId: string;
  leadId: string;
}): Promise<ClaimInviteDeliveryResult> {
  return sendClaimInvitation({
    therapistId: input.therapistId,
    sourceLeadId: input.leadId,
    inviteSource: "first_lead",
  });
}
