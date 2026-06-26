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
  problemName?: string | null;
  populationName?: string | null;
  message: string;
  therapistName: string;
};

function renderTherapistMessage(p: LeadPayload): string {
  const lines = [
    "פנייה חדשה מטיפולינקס",
    "",
    `שם: ${p.visitorName}`,
    `טלפון: ${p.visitorPhone}`,
  ];
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

async function sendEmail(_to: string, _body: string): Promise<DeliveryResult> {
  // Email adapter scaffold — not yet implemented.
  return { status: "pending", error: "email_adapter_not_implemented" };
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
    if (channel === "email") return await sendEmail(destination, body);
    return { status: "failed", error: "unknown_channel" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "dispatch_error" };
  }
}

export type AnyDB = SupabaseClient<Database>;