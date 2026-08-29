import { createFileRoute } from "@tanstack/react-router";

/**
 * Twilio WhatsApp message-status callback (POST only, signature required).
 *
 * This is the ONLY signal that can charge a WhatsApp lead: the therapist is
 * billed exactly once when the provider reports `delivered`. `failed` and
 * `undelivered` release the budget reservation without any charge. Retries and
 * out-of-order deliveries are absorbed idempotently by the database function.
 */
export const Route = createFileRoute("/api/public/whatsapp/lead-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyTwilioWebhook } = await import("@/lib/twilio-voice.server");
        const verified = await verifyTwilioWebhook(request);
        if (!verified.ok) return new Response("Forbidden", { status: verified.status });

        const messageSid = verified.params["MessageSid"] ?? verified.params["SmsSid"] ?? "";
        const status = verified.params["MessageStatus"] ?? verified.params["SmsStatus"] ?? "";
        const errorCode = verified.params["ErrorCode"] ?? "";

        if (!messageSid || !status) return new Response("", { status: 204 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin.rpc("record_whatsapp_lead_status", {
          _message_sid: messageSid,
          _status: status,
          _error_code: errorCode || (null as unknown as string),
        });
        if (error) {
          console.error("[whatsapp-lead] status bookkeeping failed", { code: error.code });
          return new Response("", { status: 500 });
        }

        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row?.billed && row.therapist_id) {
          try {
            const { sendBudgetExhaustedNotification } = await import("@/lib/billing-budget.server");
            await sendBudgetExhaustedNotification(row.therapist_id);
          } catch (notificationError) {
            console.error("[billing-budget] whatsapp notification failed", {
              error: notificationError instanceof Error ? notificationError.message : "unknown_error",
            });
          }
        }

        return new Response("", { status: 204 });
      },
    },
  },
});
