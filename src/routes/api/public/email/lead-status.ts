import { createFileRoute } from "@tanstack/react-router";

/**
 * Brevo transactional-email status webhook.
 *
 * Billing boundary: only `delivered` may turn an Email lead into a billable
 * event. Deferred delivery keeps the reservation; terminal delivery failures
 * release it. Database bookkeeping is idempotent for webhook retries.
 */
export const Route = createFileRoute("/api/public/email/lead-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { brevoEmailLeadDeliveryId, normalizeBrevoEmailEvent, verifyBrevoWebhookAuthorization } =
          await import("@/lib/lead-delivery.server");

        if (!verifyBrevoWebhookAuthorization(request)) {
          return new Response("Forbidden", { status: 403 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("", { status: 204 });
        }

        const events = Array.isArray(raw) ? raw : [raw];
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        for (const item of events) {
          if (!item || typeof item !== "object") continue;
          const payload = item as Record<string, unknown>;
          const { applyBroadcastBrevoWebhook } = await import("@/lib/admin-broadcast.server");
          if (await applyBroadcastBrevoWebhook(payload)) continue;
          const status = normalizeBrevoEmailEvent(payload.event);
          if (!status) continue;

          const messageId =
            typeof payload["message-id"] === "string"
              ? payload["message-id"]
              : typeof payload.messageId === "string"
                ? payload.messageId
                : "";
          const tags = Array.isArray(payload.tags)
            ? payload.tags
            : typeof payload.tag === "string"
              ? (() => {
                  try {
                    const parsed = JSON.parse(payload.tag) as unknown;
                    return Array.isArray(parsed) ? parsed : [];
                  } catch {
                    return [];
                  }
                })()
              : [];
          const deliveryId = brevoEmailLeadDeliveryId(tags);
          if (!messageId && !deliveryId) continue;

          const errorCode =
            typeof payload.reason === "string"
              ? payload.reason
              : typeof payload.error === "string"
                ? payload.error
                : status;

          const { data: rows, error } = await supabaseAdmin.rpc("record_email_lead_status", {
            _message_id: messageId,
            _status: status,
            _error_code: errorCode,
            _delivery_id: deliveryId ?? (null as unknown as string),
          });
          if (error) {
            console.error("[email-lead] status bookkeeping failed", { code: error.code });
            return new Response("", { status: 500 });
          }

          const row = Array.isArray(rows) ? rows[0] : rows;
          if (row?.billed && row.therapist_id) {
            try {
              const { sendBudgetExhaustedNotification } = await import("@/lib/billing-budget.server");
              await sendBudgetExhaustedNotification(row.therapist_id);
            } catch (notificationError) {
              console.error("[billing-budget] email notification failed", {
                error: notificationError instanceof Error ? notificationError.message : "unknown_error",
              });
            }
          }
        }

        return new Response("", { status: 204 });
      },
    },
  },
});
