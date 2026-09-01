import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recruitmentTokenHash } from "./recruitment-delivery.server";

const InviteInputSchema = z.object({
  token: z.string().trim().min(20).max(500),
});

export type RecruitmentInvitePublicState = {
  valid: boolean;
  status: "valid" | "registered" | "unavailable";
  emailHint: string | null;
};

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export const getRecruitmentInvitePublicState = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => InviteInputSchema.parse(input))
  .handler(async ({ data }): Promise<RecruitmentInvitePublicState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await recruitmentTokenHash(data.token);
    const result = await supabaseAdmin
      .from("therapist_recruitment_invitations")
      .select("destination_normalized, status, submitted_at, bounced_at, declined_at, registered_at")
      .eq("invite_token_hash", hash)
      .eq("channel", "email")
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) return { valid: false, status: "unavailable", emailHint: null };

    const row = result.data as any;
    if (row.status === "registered" || row.registered_at) {
      return { valid: false, status: "registered", emailHint: maskEmail(row.destination_normalized) };
    }
    const valid =
      (row.status === "submitted" || row.status === "delivered") &&
      Boolean(row.submitted_at) &&
      !row.bounced_at &&
      !row.declined_at;
    return {
      valid,
      status: valid ? "valid" : "unavailable",
      emailHint: maskEmail(row.destination_normalized),
    };
  });

export const completeRecruitmentInviteRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const hash = await recruitmentTokenHash(data.token);
    const result = await context.supabase.rpc("claim_recruitment_invite", { _token_hash: hash });
    if (result.error) throw new Error(result.error.message);
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (!row) throw new Error("לא ניתן להשלים את ההצטרפות באמצעות ההזמנה.");
    return {
      invitationId: (row as any).invitation_id as string,
      accountId: (row as any).account_id as string,
      createdAccount: Boolean((row as any).created_account),
    };
  });
