import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const WhatsAppLeadSchema = z.object({
  therapistId: z.string().uuid(),
  sourceProblemId: z.string().uuid().nullable().optional(),
  populationId: z.string().uuid().nullable().optional(),
  ctaId: z.string().trim().min(1).max(64).default("whatsapp_lead"),
  visitorName: z.string().trim().min(2).max(100),
  visitorPhone: z.string().trim().min(6).max(40),
  message: z.string().trim().min(2).max(2000),
  challengeId: z.string().uuid(),
  challengeAnswer: z.coerce.number().int(),
});

export type WhatsAppLeadResult =
  | { ok: true; leadId: string; deliveryStatus: "queued" }
  | {
      ok: false;
      reason:
        | "invalid_phone"
        | "rate_limit_exceeded"
        | "challenge_failed"
        | "challenge_expired"
        | "therapist_unavailable"
        | "delivery_failed";
      message: string;
    };

/**
 * Create a WhatsApp lead and deliver it to the therapist server-side.
 *
 * The visitor never receives the therapist's number and never leaves Tipulinks.
 * The database call performs rate limiting, single-use challenge consumption,
 * eligibility checks and the atomic monthly-budget reservation in ONE
 * transaction; sending happens only after that transaction commits, and the
 * therapist is charged only when Twilio reports the message as delivered.
 */
export const createWhatsAppLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => WhatsAppLeadSchema.parse(input))
  .handler(async ({ data }): Promise<WhatsAppLeadResult> => {
    const { isContactChannelEnabled } = await import("./contact-channel-settings.server");
    if (!(await isContactChannelEnabled("whatsapp"))) {
      return {
        ok: false,
        reason: "therapist_unavailable",
        message: "לא ניתן לשלוח הודעת WhatsApp בפרופיל זה כרגע.",
      };
    }

    const { normalizeIsraeliPhone } = await import("./phone-il");
    const visitorPhone = normalizeIsraeliPhone(data.visitorPhone);
    if (!visitorPhone.ok) {
      return { ok: false, reason: "invalid_phone", message: "מספר טלפון ישראלי לא תקין." };
    }

    const { deriveRequestIdentity } = await import("./lead-challenge.server");
    const { ipHash, sessionId, sessionHash, userAgent } = deriveRequestIdentity(getRequest()?.headers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error: rpcErr } = await supabaseAdmin.rpc("submit_whatsapp_lead", {
      _challenge_id: data.challengeId,
      _answer: data.challengeAnswer,
      _ip_hash: ipHash,
      _session_hash: sessionHash,
      _session_id: sessionId,
      _therapist_id: data.therapistId,
      _cta_id: data.ctaId,
      _source_problem_id: data.sourceProblemId ?? (null as unknown as string),
      _population_id: data.populationId ?? (null as unknown as string),
      _visitor_name: data.visitorName,
      _visitor_phone: visitorPhone.e164,
      _message: data.message,
      _user_agent: userAgent ?? (null as unknown as string),
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.allowed) {
      const reason = row?.reason;
      if (reason === "rate_limit_exceeded") {
        return {
          ok: false,
          reason: "rate_limit_exceeded",
          message: "נשלחו מספר פניות בזמן קצר. ניתן לנסות שוב מאוחר יותר.",
        };
      }
      if (reason === "challenge_expired") {
        return { ok: false, reason: "challenge_expired", message: "תוקף האימות פג. הוצג תרגיל חדש." };
      }
      if (reason === "therapist_unavailable" || reason === "monthly_budget_exhausted") {
        return {
          ok: false,
          reason: "therapist_unavailable",
          message: "לא ניתן לשלוח הודעה לפרופיל זה כרגע.",
        };
      }
      return { ok: false, reason: "challenge_failed", message: "האימות נכשל. נסו לפתור את התרגיל החדש." };
    }

    const leadId = row.lead_id as string;
    const deliveryId = row.delivery_id as string;
    const destination = (row.destination ?? "").trim();

    const therapistDestination = normalizeIsraeliPhone(destination);
    if (!therapistDestination.ok) {
      await supabaseAdmin.rpc("fail_whatsapp_lead_delivery", {
        _delivery_id: deliveryId,
        _error_code: "invalid_destination",
      });
      return {
        ok: false,
        reason: "therapist_unavailable",
        message: "לא ניתן לשלוח הודעה לפרופיל זה כרגע.",
      };
    }

    const { sendWhatsAppLead } = await import("./whatsapp-lead.server");
    const sent = await sendWhatsAppLead({
      destinationE164: therapistDestination.e164,
      payload: {
        visitorName: data.visitorName,
        visitorPhone: visitorPhone.e164,
        message: data.message,
      },
    });

    if (!sent.ok) {
      // No message left the platform: release the reservation so the therapist's
      // budget and search visibility are restored, and never charge.
      const { error: failErr } = await supabaseAdmin.rpc("fail_whatsapp_lead_delivery", {
        _delivery_id: deliveryId,
        _error_code: sent.code,
      });
      if (failErr) {
        console.error("[whatsapp-lead] failure bookkeeping failed", { leadId, code: failErr.code });
      }
      return {
        ok: false,
        reason: "delivery_failed",
        message: "לא הצלחנו לשלוח את ההודעה כרגע. נסו שוב מאוחר יותר.",
      };
    }

    const { error: attachErr } = await supabaseAdmin.rpc("attach_whatsapp_lead_message", {
      _delivery_id: deliveryId,
      _message_sid: sent.sid,
    });
    if (attachErr) {
      // The message is already out; keep the lead recorded and log server-side.
      console.error("[whatsapp-lead] message id attach failed", { leadId, code: attachErr.code });
    }

    try {
      const { sendNewLeadAccountNotification } = await import("./account-notifications.server");
      await sendNewLeadAccountNotification(data.therapistId, leadId);
    } catch (notificationError) {
      console.error("[account-notification] whatsapp lead failed", {
        leadId,
        error: notificationError instanceof Error ? notificationError.message : "unknown_error",
      });
    }

    return { ok: true, leadId, deliveryStatus: "queued" };
  });
