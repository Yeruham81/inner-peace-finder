import { createFileRoute } from "@tanstack/react-router";

/**
 * Therapist-leg status callback (POST only, signature required).
 *
 * This is the ONLY signal that can create the billable event. Any answer —
 * person, receptionist, IVR or voicemail — bills exactly once; busy, no-answer,
 * failed and canceled never bill. Retries and out-of-order deliveries are
 * absorbed idempotently by the database function.
 */
export const Route = createFileRoute("/api/public/voice/therapist-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyTwilioWebhook } = await import("@/lib/twilio-voice.server");
        const verified = await verifyTwilioWebhook(request);
        if (!verified.ok) return new Response("Forbidden", { status: verified.status });

        const parentSid = verified.params["ParentCallSid"] ?? "";
        const childSid = verified.params["CallSid"] ?? "";
        const status = verified.params["CallStatus"] ?? "";
        const sequence = Number.parseInt(verified.params["SequenceNumber"] ?? "", 10);
        const duration = Number.parseInt(verified.params["CallDuration"] ?? "", 10);

        if (!parentSid || !status) return new Response("", { status: 204 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin.rpc("record_voice_call_leg_event", {
          _parent_call_sid: parentSid,
          _child_call_sid: childSid || (null as unknown as string),
          _leg: "therapist",
          _status: status,
          _sequence: Number.isFinite(sequence) ? sequence : (null as unknown as number),
          _duration: Number.isFinite(duration) ? duration : (null as unknown as number),
        });
        if (error) {
          console.error("[voice] therapist-leg bookkeeping failed", { code: error.code });
          return new Response("", { status: 500 });
        }

        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row?.billable_created && row.attempt_id) {
          const { data: session } = await supabaseAdmin
            .from("voice_call_sessions")
            .select("therapist_id, lead_id")
            .eq("id", row.attempt_id)
            .maybeSingle();
          if (session?.therapist_id) {
            try {
              const { sendBudgetExhaustedNotification } = await import("@/lib/billing-budget.server");
              await sendBudgetExhaustedNotification(session.therapist_id);
            } catch (notificationError) {
              console.error("[billing-budget] voice notification failed", {
                therapistId: session.therapist_id,
                error: notificationError instanceof Error ? notificationError.message : "unknown_error",
              });
            }
            if (session.lead_id) {
              try {
                const { sendNewLeadAccountNotification } = await import("@/lib/account-notifications.server");
                await sendNewLeadAccountNotification(session.therapist_id, session.lead_id);
              } catch (notificationError) {
                console.error("[account-notification] voice lead failed", {
                  therapistId: session.therapist_id,
                  leadId: session.lead_id,
                  error: notificationError instanceof Error ? notificationError.message : "unknown_error",
                });
              }
            }
          }
        }

        return new Response("", { status: 204 });
      },
    },
  },
});
