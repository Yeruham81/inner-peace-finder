import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const LeadSchema = z.object({
  therapistId: z.string().uuid(),
  sourceProblemId: z.string().uuid().nullable().optional(),
  populationId: z.string().uuid().nullable().optional(),
  ctaId: z.string().trim().min(1).max(64).default("primary"),
  visitorName: z.string().trim().min(2).max(100),
  visitorPhone: z
    .string()
    .trim()
    .regex(/^(\+?972|0)(5\d|[23489])\d{7,8}$/, "מספר טלפון לא תקין"),
  message: z.string().trim().min(2).max(2000),
  challengeId: z.string().uuid(),
  challengeAnswer: z.coerce.number().int(),
});

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LeadSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const headers = req?.headers;

    // 1) All rate-limiting identifiers are derived server-side by the single
    //    HMAC helper; nothing about the IP, the session or the expected answer
    //    comes from client input.
    const { deriveRequestIdentity } = await import("./lead-challenge.server");
    const { ipHash, sessionId, sessionHash, userAgent } = deriveRequestIdentity(headers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2) ONE transactional database operation performs: rate-limit locking and
    //    accounting, single-use challenge consumption, eligibility re-check,
    //    billable CTA creation and lead creation. Any failure rolls all of it
    //    back — no consumed challenge, no CTA without its lead.
    const { data: rows, error: rpcErr } = await supabaseAdmin.rpc("submit_lead", {
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
      _visitor_phone: data.visitorPhone,
      _message: data.message,
      _user_agent: userAgent ?? (null as unknown as string),
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (!row?.allowed) {
      const reason = row?.reason;
      if (reason === "rate_limit_exceeded") {
        return {
          ok: false as const,
          reason: "rate_limit_exceeded" as const,
          message: "נשלחו מספר פניות בזמן קצר. ניתן לנסות שוב מאוחר יותר.",
        };
      }
      if (reason === "challenge_expired") {
        return {
          ok: false as const,
          reason: "challenge_expired" as const,
          message: "תוקף האימות פג. הוצג תרגיל חדש.",
        };
      }
      if (reason === "unclaimed_contact_limit") {
        return {
          ok: false as const,
          reason: "unclaimed_contact_limit" as const,
          message: "לא ניתן לשלוח פנייה נוספת לפרופיל זה לפני אישור המטפל/ת.",
        };
      }
      if (reason === "therapist_unavailable") {
        return {
          ok: false as const,
          reason: "therapist_unavailable" as const,
          message: "לא ניתן לשלוח פנייה לפרופיל זה כרגע.",
        };
      }
      return {
        ok: false as const,
        reason: "challenge_failed" as const,
        message: "האימות נכשל. נסו לפתור את התרגיל החדש.",
      };
    }

    // The transaction has committed: the lead exists and stays recorded even if
    // external delivery fails.
    const leadId = row.lead_id as string;
    const billable = !!row.billable;
    const awaitingTherapistConsent = row.reason === "accepted_unclaimed";

    // An admin-created, unclaimed profile gets at most one initial inquiry.
    // The visitor's personal details are held in the database and are NOT
    // dispatched to the therapist until the participation/claim flow is
    // completed. This also keeps the first inquiry non-billable.
    if (awaitingTherapistConsent) {
      return {
        ok: true as const,
        leadId,
        billable: false,
        deliveryStatus: "pending" as const,
        awaitingTherapistConsent: true as const,
      };
    }
    const channel = (row.delivery_channel ?? "whatsapp") as "whatsapp" | "sms" | "email";
    const destination = row.destination ?? "";

    // 3) Dispatch (post-commit; provider errors never lose the stored lead)
    let problemName: string | null = null;
    let populationName: string | null = null;
    if (data.sourceProblemId && /^\d+$/.test(data.sourceProblemId)) {
      const { data: p, error: pErr } = await supabaseAdmin
        .from("problems")
        .select("name:name_he")
        .eq("id", data.sourceProblemId as unknown as number)
        .maybeSingle();
      if (pErr) {
        console.error("[lead] problem enrichment failed", { leadId, code: pErr.code });
      } else {
        problemName = p?.name ?? null;
      }
    }
    if (data.populationId) {
      const { data: pop, error: popErr } = await supabaseAdmin
        .from("population_groups")
        .select("name")
        .eq("id", data.populationId)
        .maybeSingle();
      if (popErr) {
        console.error("[lead] population enrichment failed", { leadId, code: popErr.code });
      } else {
        populationName = pop?.name ?? null;
      }
    }

    const { dispatchLead } = await import("@/lib/lead-delivery.server");
    let result;
    if (!destination) {
      result = { status: "failed" as const, error: "no_destination", providerMessageId: null };
    } else {
      result = await dispatchLead(channel, destination, {
        visitorName: data.visitorName,
        visitorPhone: data.visitorPhone,
        problemName,
        populationName,
        message: data.message,
        therapistName: row.therapist_name ?? "",
      });
    }

    const { error: statusErr } = await supabaseAdmin
      .from("lead_events")
      .update({
        delivery_status: result.status,
        provider_message_id: result.providerMessageId ?? null,
      })
      .eq("id", leadId);
    // The lead is already recorded. If the post-commit status sync fails, keep
    // the database row at its existing `pending` status, log the server-side
    // failure, and still report success to the user. Do not claim delivery
    // succeeded when that status could not be persisted.
    if (statusErr) {
      console.error("[lead] delivery status update failed", { leadId, code: statusErr.code });
    }

    return {
      ok: true as const,
      leadId,
      billable,
      deliveryStatus: statusErr ? ("pending" as const) : result.status,
    };
  });
