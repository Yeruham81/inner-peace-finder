import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { applyEligibility } from "./search-eligibility";

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

    // 1) All rate-limiting identifiers are derived server-side; nothing about
    //    the IP, the session or the expected answer comes from client input.
    const { deriveRequestIdentity } = await import("./lead-challenge.server");
    const { ipHash, sessionId, sessionHash, userAgent } = deriveRequestIdentity(headers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2) Atomic server-side challenge consumption + IP rate limiting. This must
    //    run before any billing, lead insertion, contact resolution or dispatch.
    const { data: authRows, error: authErr } = await supabaseAdmin.rpc("authorize_lead_submission", {
      _challenge_id: data.challengeId,
      _answer: data.challengeAnswer,
      _ip_hash: ipHash,
      _session_hash: sessionHash,
      _therapist_id: data.therapistId,
    });
    if (authErr) throw new Error(authErr.message);
    const authRow = Array.isArray(authRows) ? authRows[0] : authRows;
    if (!authRow?.allowed) {
      const reason = authRow?.reason;
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
      return {
        ok: false as const,
        reason: "challenge_failed" as const,
        message: "האימות נכשל. נסו לפתור את התרגיל החדש.",
      };
    }

    // 2.5) Session velocity limit (preserved): max 5 distinct therapists / 15 min.
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recent, error: rlErr } = await supabaseAdmin
      .from("lead_events")
      .select("therapist_id")
      .eq("session_id", sessionId)
      .gte("created_at", windowStart);
    if (rlErr) throw new Error(rlErr.message);
    const distinct = new Set((recent ?? []).map((r: { therapist_id: string }) => r.therapist_id));
    if (!distinct.has(data.therapistId) && distinct.size >= 5) {
      return {
        ok: false as const,
        reason: "rate_limit_exceeded" as const,
        message: "נשלחו מספר פניות בזמן קצר. ניתן לנסות שוב מאוחר יותר.",
      };
    }

    // 2) Eligibility gate — before billing, lead insertion, contact resolution
    //    or dispatch. Missing and ineligible therapists get the same generic
    //    response so profile state is never revealed.
    const { data: therapist, error: tErr } = await applyEligibility(
      supabaseAdmin
        .from("therapists")
        .select("id, full_name, phone, preferred_contact_channel, contact_destination")
        .eq("id", data.therapistId),
    ).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!therapist) {
      return {
        ok: false as const,
        reason: "therapist_unavailable" as const,
        message: "לא ניתן לשלוח פנייה לפרופיל זה כרגע.",
      };
    }

    // 3) Bill via atomic RPC (only once per session+therapist+cta)
    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("record_cta_click", {
      _therapist_id: data.therapistId,
      _session_id: sessionId,
      _cta_id: data.ctaId,
      _source_problem_id: data.sourceProblemId ?? undefined,
      _ip_hash: ipHash ?? undefined,
      _user_agent: userAgent ?? undefined,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const ctaRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const ctaEventId = (ctaRow?.click_id as string | undefined) ?? null;
    const billable = !!ctaRow?.billable;

    // 4) Resolve channel + destination
    const channel = (therapist.preferred_contact_channel ?? "whatsapp") as "whatsapp" | "sms" | "email";
    const destination = therapist.contact_destination ?? therapist.phone ?? "";

    // 5) Insert lead row
    const { data: leadRow, error: insErr } = await supabaseAdmin
      .from("lead_events")
      .insert({
        cta_event_id: ctaEventId,
        session_id: sessionId,
        therapist_id: data.therapistId,
        problem_id: data.sourceProblemId ?? null,
        population_id: data.populationId ?? null,
        visitor_name: data.visitorName,
        visitor_phone: data.visitorPhone,
        message: data.message,
        challenge_presented: null,
        challenge_passed: true,
        delivery_channel: channel,
        delivery_status: "pending",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // 6) Dispatch (best-effort; do not throw to user on provider error)
    let problemName: string | null = null;
    let populationName: string | null = null;
    if (data.sourceProblemId) {
      const { data: p } = await supabaseAdmin
        .from("problems")
        .select("name:name_he")
        .eq("id", data.sourceProblemId as unknown as number)
        .maybeSingle();
      problemName = p?.name ?? null;
    }
    if (data.populationId) {
      const { data: pop } = await supabaseAdmin
        .from("population_groups")
        .select("name")
        .eq("id", data.populationId)
        .maybeSingle();
      populationName = pop?.name ?? null;
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
        therapistName: therapist.full_name,
      });
    }

    await supabaseAdmin
      .from("lead_events")
      .update({
        delivery_status: result.status,
        provider_message_id: result.providerMessageId ?? null,
      })
      .eq("id", leadRow.id);

    return {
      ok: true as const,
      leadId: leadRow.id as string,
      billable,
      deliveryStatus: result.status,
    };
  });
