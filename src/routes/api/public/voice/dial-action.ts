import { createFileRoute } from "@tanstack/react-router";

/**
 * `<Dial action>` webhook (POST only, signature required).
 *
 * Reached after the bridge ends or the therapist leg failed to connect. No
 * billing decision is made here — billing lives exclusively in the
 * therapist-leg status callback — and the visitor simply hangs up.
 */
export const Route = createFileRoute("/api/public/voice/dial-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyTwilioWebhook, buildHangupTwiml, twimlResponse } = await import(
          "@/lib/twilio-voice.server"
        );
        const verified = await verifyTwilioWebhook(request);
        if (!verified.ok) return new Response("Forbidden", { status: verified.status });
        return twimlResponse(buildHangupTwiml());
      },
    },
  },
});
