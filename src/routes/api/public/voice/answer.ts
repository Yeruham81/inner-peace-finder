import { createFileRoute } from "@tanstack/react-router";

/**
 * TwiML webhook for the visitor leg (POST only, signature required).
 *
 * The therapist is dialed only when Twilio's synchronous Answering Machine
 * Detection classified the visitor answer as `human`. Voicemail, fax, machine or
 * an unknown/unusable result ends the call without dialing anyone and without
 * any billable event.
 */
export const Route = createFileRoute("/api/public/voice/answer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          verifyTwilioWebhook,
          buildBridgeTwiml,
          buildHangupTwiml,
          twimlResponse,
          getTwilioConfig,
          voiceCallbackUrl,
        } = await import("@/lib/twilio-voice.server");


        const verified = await verifyTwilioWebhook(request);
        if (!verified.ok) return new Response("Forbidden", { status: verified.status });

        const { visitorAnswerIsHuman } = await import("@/lib/voice-call-billing");
        const callSid = verified.params["CallSid"] ?? "";
        const answeredBy = verified.params["AnsweredBy"] ?? null;

        if (!callSid) return twimlResponse(buildHangupTwiml());

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin.rpc("voice_call_caller_answered", {
          _parent_call_sid: callSid,
          _amd_result: visitorAnswerIsHuman(answeredBy) ? "human" : (answeredBy ?? "unknown"),
        });
        if (error) {
          console.error("[voice] caller-answer bookkeeping failed", { code: error.code });
          return twimlResponse(buildHangupTwiml());
        }

        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row?.allowed || !row.therapist_phone) {
          return twimlResponse(buildHangupTwiml());
        }

        const config = getTwilioConfig();
        const base = sanitizedBase(verified.url);
        return twimlResponse(
          buildBridgeTwiml({
            therapistPhone: row.therapist_phone,
            callerId: config.phoneNumber,
            therapistStatusCallbackUrl: `${base}/api/public/voice/therapist-status`,
            dialActionUrl: `${base}/api/public/voice/dial-action`,
          }),
        );
      },
    },
  },
});
