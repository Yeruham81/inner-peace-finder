import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ClaimRequest = {
  id: string;
  therapist_id: string;
  requester_account_id: string;
  status: ClaimStatus;
  verification_method: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type ClaimableTherapist = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string;
  city: string | null;
  image_url: string | null;
  is_owned: boolean;
};

const IdSchema = z.object({ therapistId: z.string().uuid() });
const CreateSchema = z.object({
  therapistId: z.string().uuid(),
  verificationMethod: z.string().max(60).optional(),
  verificationData: z.record(z.string(), z.unknown()).optional(),
});
const CancelSchema = z.object({ claimId: z.string().uuid() });

async function ensureAccount(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
  const { data: existing } = await supabase
    .from("therapist_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("therapist_accounts")
    .insert({ auth_user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export const submitClaimRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClaimRequest> => {
    const { supabase, userId } = context;
    const accountId = await ensureAccount(supabase, userId);

    // Precondition: profile must be unclaimed. RLS also enforces this.
    const { data: t, error: tErr } = await supabase
      .from("therapists")
      .select("id, owner_account_id")
      .eq("id", data.therapistId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!t) throw new Error("Profile not found");
    if (t.owner_account_id) throw new Error("Profile is already claimed");

    const { data: row, error } = await supabase
      .from("therapist_claim_requests")
      .insert({
        therapist_id: data.therapistId,
        requester_account_id: accountId,
        verification_method: data.verificationMethod ?? null,
        verification_data: (data.verificationData ?? {}) as never,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("You already have an open request for this profile");
      throw new Error(error.message);
    }
    return row as ClaimRequest;
  });

export const listMyClaimRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClaimRequest[]> => {
    const { supabase, userId } = context;
    const { data: account } = await supabase
      .from("therapist_accounts")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!account) return [];
    const { data: rows, error } = await supabase
      .from("therapist_claim_requests")
      .select("*")
      .eq("requester_account_id", account.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ClaimRequest[];
  });

export const cancelClaimRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CancelSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClaimRequest> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("therapist_claim_requests")
      .update({ status: "cancelled" })
      .eq("id", data.claimId)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ClaimRequest;
  });

export const getClaimableTherapist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClaimableTherapist | null> => {
    const { supabase } = context;
    const { data: t, error } = await supabase
      .from("therapists")
      .select("id, slug, full_name, professional_title, city, image_url, owner_account_id")
      .eq("id", data.therapistId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) return null;
    return {
      id: t.id,
      slug: t.slug,
      full_name: t.full_name,
      professional_title: t.professional_title,
      city: t.city,
      image_url: t.image_url,
      is_owned: !!t.owner_account_id,
    };
  });