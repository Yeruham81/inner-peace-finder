import { createFileRoute } from "@tanstack/react-router";

/**
 * Visitor (parent) leg status callback (POST only, signature required).
 *
 * Recorded for lifecycle/observability only. A visitor-leg event is NEVER
 * billable, even when the parent call completes with a long duration.
 */
export const Route = createFileRoute("/api/public/voice/parent-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyTwilioWebhook } = await import("@/lib/twilio-voice.server");
        const verified = await verifyTwilioWebhook(request);
        if (!verified.ok) return new Response("Forbidden", { status: verified.status });

        const callSid = verified.params["CallSid"] ?? "";
        const status = verified.params["CallStatus"] ?? "";
        const sequence = Number.parseInt(verified.params["SequenceNumber"] ?? "", 10);
        const duration = Number.parseInt(verified.params["CallDuration"] ?? "", 10);

        if (!callSid || !status) return new Response("", { status: 204 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("record_voice_call_leg_event", {
          _parent_call_sid: callSid,
          _child_call_sid: null as unknown as string,
          _leg: "caller",
          _status: status,
          _sequence: Number.isFinite(sequence) ? sequence : (null as unknown as number),
          _duration: Number.isFinite(duration) ? duration : (null as unknown as number),
        });
        if (error) {
          console.error("[voice] caller-leg bookkeeping failed", { code: error.code });
          return new Response("", { status: 500 });
        }

        return new Response("", { status: 204 });
      },
    },
  },
});
