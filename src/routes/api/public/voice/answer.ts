import { createFileRoute } from "@tanstack/react-router";

/**
 * TwiML webhook for the visitor leg (POST only, signature required).
 *
 * A technically answered visitor leg proceeds immediately to the therapist.
 * The visitor is never asked to speak or press a key.
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

        const callSid = verified.params["CallSid"] ?? "";

        if (!callSid) return twimlResponse(buildHangupTwiml());

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin.rpc("voice_call_caller_answered", {
          _parent_call_sid: callSid,
          // The RPC signature is retained for backwards compatibility, but
          // caller-side answer detection is deliberately disabled.
          _amd_result: "disabled",
        });
        if (error) {
          console.error("[voice] caller-answer bookkeeping failed", { code: error.code });
          return twimlResponse(buildHangupTwiml());
        }

        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row?.allowed || !row.therapist_phone) {
          return twimlResponse(buildHangupTwiml());
        }

        // Database rows may contain familiar local formatting. Twilio must
        // receive only a validated E.164 destination on the second leg.
        const { normalizeIsraeliPhone } = await import("@/lib/phone-il");
        const therapistPhone = normalizeIsraeliPhone(row.therapist_phone);
        if (!therapistPhone.ok) return twimlResponse(buildHangupTwiml());

        const config = getTwilioConfig();
        return twimlResponse(
          buildBridgeTwiml({
            therapistPhone: therapistPhone.e164,
            callerId: config.phoneNumber,
            // Trusted-origin URLs only; the incoming request's headers are ignored.
            therapistStatusCallbackUrl: voiceCallbackUrl("/api/public/voice/therapist-status"),
            dialActionUrl: voiceCallbackUrl("/api/public/voice/dial-action"),
          }),
        );
      },
    },
  },
});
