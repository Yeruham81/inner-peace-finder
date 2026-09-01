import { createFileRoute } from "@tanstack/react-router";

import { verifyBrevoWebhookAuthorization } from "@/lib/lead-delivery.server";
import { applyRecruitmentBrevoWebhook } from "@/lib/recruitment-delivery.server";

export const Route = createFileRoute("/api/public/email/recruitment-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyBrevoWebhookAuthorization(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const events = Array.isArray(body) ? body : [body];
        try {
          for (const event of events) await applyRecruitmentBrevoWebhook(event);
        } catch (error) {
          console.error("[recruitment] Brevo webhook failed", {
            error: error instanceof Error ? error.message : "unknown",
          });
          return new Response("Webhook processing failed", { status: 500 });
        }
        return new Response("OK", { status: 200 });
      },
    },
  },
});
