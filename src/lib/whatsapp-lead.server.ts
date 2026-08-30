/**
 * Server-only WhatsApp lead delivery through the Twilio Messages API.
 *
 * Boundaries enforced here:
 *  - The therapist's WhatsApp destination is read server-side and never
 *    returned to the browser. The visitor stays inside Tipulinks.
 *  - Twilio callback URLs are built exclusively from `TIPULINKS_PUBLIC_ORIGIN`;
 *    request headers are never used to construct or reconstruct them.
 *  - Sending authenticates with the restricted API key against the account
 *    context. `TWILIO_AUTH_TOKEN` is only ever used to validate signatures.
 */
import { getTwilioConfig, voiceCallbackUrl } from "./twilio-voice.server";

export const WHATSAPP_LEAD_STATUS_PATH = "/api/public/whatsapp/lead-status";

export type WhatsAppSendResult = { ok: true; sid: string } | { ok: false; code: string };

export type WhatsAppLeadMessage = {
  visitorName: string;
  visitorPhone: string;
  message: string;
};

/** WhatsApp `From` sender, e.g. `whatsapp:+14155238886`. */
export function whatsappSender(): string | null {
  const raw = process.env["TWILIO_WHATSAPP_FROM"]?.trim();
  if (!raw) return null;
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

export function whatsappContentSid(): string | null {
  return process.env["TIPULINKS_WHATSAPP_LEAD_CONTENT_SID"]?.trim() || null;
}

export function whatsappDirectChatUrl(visitorPhoneE164: string): string {
  return `https://wa.me/${visitorPhoneE164.replace(/^\+/, "")}`;
}

export function whatsappContentVariables(payload: WhatsAppLeadMessage): string {
  return JSON.stringify({
    "1": payload.visitorName,
    "2": payload.visitorPhone,
    "3": payload.message,
    "4": whatsappDirectChatUrl(payload.visitorPhone),
  });
}

export function whatsappLeadStatusCallbackUrl(deliveryId: string): string {
  const url = new URL(voiceCallbackUrl(WHATSAPP_LEAD_STATUS_PATH));
  url.searchParams.set("delivery_id", deliveryId);
  return url.toString();
}

/**
 * Send the lead to the therapist. `destination` must already be a normalized
 * E.164 Israeli number resolved server-side from the therapist record.
 */
export async function sendWhatsAppLead(input: {
  destinationE164: string;
  deliveryId: string;
  payload: WhatsAppLeadMessage;
}): Promise<WhatsAppSendResult> {
  const from = whatsappSender();
  if (!from) return { ok: false, code: "whatsapp_sender_not_configured" };

  const contentSid = whatsappContentSid();
  if (!contentSid) {
    return { ok: false, code: "whatsapp_template_not_configured" };
  }

  let config: ReturnType<typeof getTwilioConfig>;
  let statusCallback: string;
  try {
    config = getTwilioConfig();
    statusCallback = whatsappLeadStatusCallbackUrl(input.deliveryId);
  } catch {
    return { ok: false, code: "whatsapp_not_configured" };
  }

  const params = new URLSearchParams({
    To: `whatsapp:${input.destinationE164}`,
    From: from,
    StatusCallback: statusCallback,
    ContentSid: contentSid,
    ContentVariables: whatsappContentVariables(input.payload),
  });

  const credentials = Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch {
    return { ok: false, code: "provider_unreachable" };
  }

  const json = (await response.json().catch(() => null)) as { sid?: string; code?: number; message?: string } | null;

  if (!response.ok || !json?.sid) {
    // Log the provider status/code only — never the destination or message.
    console.error("[whatsapp-lead] provider rejected send", {
      status: response.status,
      code: json?.code ?? null,
    });
    return { ok: false, code: `twilio_${json?.code ?? response.status}` };
  }

  return { ok: true, sid: json.sid };
}
