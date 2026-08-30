import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DirectContactInput = z.object({
  therapistId: z.string().uuid(),
  // Neither phone nor WhatsApp numbers are released to the browser any more:
  // the phone channel is served by the server-bridged callback flow, and
  // WhatsApp leads are delivered server-side by Tipulinks.
  method: z.enum(["whatsapp"]),
});

export type DirectContactTargetResult =
  | { ok: true; phone: string }
  | { ok: false; reason: "therapist_unavailable" | "method_unavailable"; phone: null };

/**
 * Legacy direct-contact endpoint, retained only as a hard boundary.
 *
 * Every public contact channel is now brokered server-side, so this function
 * never releases a therapist number. It is intentionally non-billable.
 */
export const getDirectContactTarget = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DirectContactInput.parse(input))
  .handler(async (): Promise<DirectContactTargetResult> => {
    return { ok: false, reason: "method_unavailable", phone: null };
  });
