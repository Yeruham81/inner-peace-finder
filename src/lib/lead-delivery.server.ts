import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DeliveryChannel = "whatsapp" | "sms" | "email";

export type DeliveryResult = {
  status: "sent" | "pending" | "failed";
  providerMessageId?: string | null;
  error?: string | null;
};

export type LeadPayload = {
  visitorName: string;
  visitorPhone: string;
  deliveryId?: string | null;
  problemName?: string | null;
  populationName?: string | null;
  message: string;
  therapistName: string;
};

function renderTherapistMessage(p: LeadPayload): string {
  const lines = ["פנייה חדשה מטיפולינקס", "", `שם: ${p.visitorName}`, `טלפון: ${p.visitorPhone}`];
  if (p.problemName) lines.push(`נושא: ${p.problemName}`);
  if (p.populationName) lines.push(`אוכלוסייה: ${p.populationName}`);
  lines.push("", "הודעה:", p.message);
  return lines.join("\n");
}

async function sendWhatsApp(to: string, body: string): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
  if (!sid || !token || !from) {
    return { status: "pending", error: "twilio_not_configured" };
  }
  const toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const params = new URLSearchParams({ To: toFormatted, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
  if (!res.ok) {
    return { status: "failed", error: json?.message ?? `twilio_${res.status}` };
  }
  return { status: "sent", providerMessageId: json?.sid ?? null };
}

async function sendSms(to: string, body: string): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) return { status: "pending", error: "twilio_sms_not_configured" };
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
  if (!res.ok) return { status: "failed", error: json?.message ?? `twilio_${res.status}` };
  return { status: "sent", providerMessageId: json?.sid ?? null };
}

const BREVO_TEMPLATE_ID = 1;

export const BREVO_EMAIL_LEAD_TAG_PREFIX = "tipulinks_email_lead_";

export function brevoEmailLeadTag(deliveryId: string): string {
  return `${BREVO_EMAIL_LEAD_TAG_PREFIX}${deliveryId}`;
}

export function brevoEmailLeadDeliveryId(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    if (typeof tag !== "string" || !tag.startsWith(BREVO_EMAIL_LEAD_TAG_PREFIX)) continue;
    const candidate = tag.slice(BREVO_EMAIL_LEAD_TAG_PREFIX.length);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function normalizeBrevoEmailEvent(event: unknown): string {
  if (typeof event !== "string") return "";
  const normalized = event
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
  if (normalized === "invalid") return "invalid_email";
  return normalized;
}

export function verifyBrevoWebhookAuthorization(request: Request): boolean {
  const expected = process.env["BREVO_WEBHOOK_SECRET"]?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const actual = header.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (expectedBytes.length !== actualBytes.length) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}

async function sendEmail(to: string, payload: LeadPayload): Promise<DeliveryResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { status: "pending", error: "brevo_not_configured" };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [
        {
          email: to,
          ...(payload.therapistName ? { name: payload.therapistName } : {}),
        },
      ],
      templateId: BREVO_TEMPLATE_ID,
      ...(payload.deliveryId ? { tags: ["tipulinks_email_lead", brevoEmailLeadTag(payload.deliveryId)] } : {}),
      params: {
        therapist_name: payload.therapistName,
        sender_name: payload.visitorName,
        message: payload.message,
        phone: payload.visitorPhone,
        // The current lead form does not collect an email address.
        // Keeping this empty makes the template's "is not empty"
        // visibility rule hide the email block.
        email: "",
      },
    }),
  });

  const json = (await res.json().catch(() => null)) as {
    messageId?: string;
    messageIds?: string[];
    message?: string;
  } | null;

  if (!res.ok) {
    return {
      status: "failed",
      error: json?.message ?? `brevo_${res.status}`,
    };
  }

  // "sent" here means Brevo accepted the transactional email request.
  // Final mailbox delivery/bounce status is a separate provider event.
  return {
    status: "sent",
    providerMessageId: json?.messageId ?? json?.messageIds?.[0] ?? null,
  };
}

export async function dispatchLead(
  channel: DeliveryChannel,
  destination: string,
  payload: LeadPayload,
): Promise<DeliveryResult> {
  const body = renderTherapistMessage(payload);
  try {
    if (channel === "whatsapp") return await sendWhatsApp(destination, body);
    if (channel === "sms") return await sendSms(destination, body);
    if (channel === "email") return await sendEmail(destination, payload);
    return { status: "failed", error: "unknown_channel" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "dispatch_error" };
  }
}

export type AnyDB = SupabaseClient<Database>;
