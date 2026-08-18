import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { applyEligibility } from "./search-eligibility";

const DirectContactInput = z.object({
  therapistId: z.string().uuid(),
  method: z.enum(["whatsapp", "phone"]),
});

export type DirectContactTargetResult =
  | { ok: true; phone: string }
  | { ok: false; reason: "therapist_unavailable" | "method_unavailable"; phone: null };

/**
 * Releases a direct phone/WhatsApp target only after an explicit user action.
 *
 * This function is intentionally non-billable. Final phone billing depends on
 * an answered-call event, and written-lead billing depends on successful lead
 * creation/handoff; neither condition is proven by merely opening a dialer or
 * WhatsApp.
 */
export const getDirectContactTarget = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DirectContactInput.parse(input))
  .handler(async ({ data }): Promise<DirectContactTargetResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: therapist, error } = await applyEligibility(
      supabaseAdmin
        .from("therapists")
        .select("phone, contact_methods")
        .eq("id", data.therapistId),
    ).maybeSingle();

    if (error) throw new Error(error.message);
    if (!therapist) {
      return {
        ok: false,
        reason: "therapist_unavailable",
        phone: null,
      };
    }

    const contactMethods = Array.isArray(therapist.contact_methods)
      ? therapist.contact_methods
      : [];
    if (!contactMethods.includes(data.method)) {
      return {
        ok: false,
        reason: "method_unavailable",
        phone: null,
      };
    }

    const phone = therapist.phone?.trim() || null;
    if (!phone) {
      return {
        ok: false,
        reason: "method_unavailable",
        phone: null,
      };
    }

    return { ok: true, phone };
  });
