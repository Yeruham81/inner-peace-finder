import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash, randomUUID } from "crypto";
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
  challengePresented: z.string().trim().min(1).max(40),
  challengeAnswer: z.coerce.number().int(),
  challengeExpected: z.coerce.number().int(),
});

function passesChallenge(answer: number, expected: number): boolean {
  return Number.isFinite(answer) && Number.isFinite(expected) && answer === expected;
}

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LeadSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const headers = req?.headers;
    const userAgent = headers?.get("user-agent") ?? null;
    const ip =
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers?.get("x-real-ip") ||
      "0.0.0.0";
    const salt = process.env.SUPABASE_PROJECT_ID ?? "salt";
    const ipHash = createHash("sha256").update(`${ip}:${salt}`).digest("hex");

    const cookieHeader = headers?.get("cookie") ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)mt_sid=([^;]+)/);
    const sessionId = match?.[1] ?? randomUUID();

    // 1) Anti-spam: gate billing on challenge correctness
    const challengePassed = passesChallenge(data.challengeAnswer, data.challengeExpected);
    if (!challengePassed) {
      return {
        ok: false as const,
        reason: "challenge_failed" as const,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1.5) Cross-therapist velocity limit: max 5 distinct therapists / 15 min / session
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
        error: "rate_limit_exceeded" as const,
        message: "שלחתם כבר מספר פניות. נסו שוב בעוד כמה דקות.",
      };
    }

    // 2) Load therapist contact prefs (server-only; phone never returned to client)
    const { data: therapist, error: tErr } = await supabaseAdmin
      .from("therapists")
      .select("id, full_name, phone, preferred_contact_channel, contact_destination")
      .eq("id", data.therapistId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!therapist) throw new Error("Therapist not found");

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
    const channel = (therapist.preferred_contact_channel ?? "whatsapp") as
      | "whatsapp"
      | "sms"
      | "email";
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
        challenge_presented: data.challengePresented,
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