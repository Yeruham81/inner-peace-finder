import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled" | "needs_information";

export type ClaimRequestType = "claim_profile" | "remove_profile";
export type VerificationMethod = "license_number" | "professional_email" | "manual_review";

export type ClaimRequest = {
  id: string;
  therapist_id: string;
  requester_account_id: string;
  status: ClaimStatus;
  request_type: ClaimRequestType;
  verification_method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type ClaimRequestWithTherapist = ClaimRequest & {
  therapist_full_name: string | null;
  therapist_slug: string | null;
};

export type ClaimableTherapist = {
  id: string;
  slug: string;
  full_name: string;
  professional_title: string | null;
  city: string | null;
  image_url: string | null;
  is_owned: boolean;
};

const IdSchema = z.object({ therapistId: z.string().uuid() });
const CreateSchema = z.object({
  therapistId: z.string().uuid(),
  requestType: z.enum(["claim_profile", "remove_profile"]),
  verificationMethod: z.enum(["license_number", "professional_email", "manual_review"]),
  licenseNumber: z.string().trim().min(2).max(60).optional(),
  professionId: z.string().uuid().optional(),
  professionalEmail: z.string().trim().email().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});
const CancelSchema = z.object({ claimId: z.string().uuid() });

async function ensureAccount(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
  const { data: existing, error: readErr } = await supabase
    .from("therapist_accounts")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
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

    // Method-specific input requirements
    if (data.verificationMethod === "license_number") {
      if (!data.licenseNumber) throw new Error("license_number required");
      if (!data.professionId) throw new Error("profession required");
    }
    if (data.verificationMethod === "professional_email" && !data.professionalEmail) {
      throw new Error("professional_email required");
    }

    // Precondition: for claim, profile must be unclaimed. RLS enforces on INSERT.
    // Claim targets are, by definition, NOT owned by the requester, so the
    // owner-scoped RLS policy cannot see them. Read the two fields needed
    // for the precondition through the trusted server client instead.
    const { trustedReadClient } = await import("./trusted-read-client.server");
    const { data: t, error: tErr } = await trustedReadClient()
      .from("therapists")
      .select("id, owner_account_id")
      .eq("id", data.therapistId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!t) throw new Error("Profile not found");
    if (data.requestType === "claim_profile" && t.owner_account_id) {
      throw new Error("Profile is already claimed");
    }

    const verificationData: Record<string, unknown> = {};
    if (data.licenseNumber) verificationData.license_number = data.licenseNumber;
    if (data.professionId) verificationData.profession_id = data.professionId;
    if (data.professionalEmail) verificationData.professional_email = data.professionalEmail;

    const { data: row, error } = await supabase
      .from("therapist_claim_requests")
      .insert({
        therapist_id: data.therapistId,
        requester_account_id: accountId,
        request_type: data.requestType,
        verification_method: data.verificationMethod,
        verification_data: verificationData as never,
        note: data.note ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505")
        throw new Error("You already have an open request for this profile");
      throw new Error(error.message);
    }

    // Fire-and-forget notification delivery (queue row was inserted by trigger).
    try {
      const { deliverPendingNotifications } = await import("./notifications.server");
      await deliverPendingNotifications();
    } catch (e) {
      console.error("[notifications] deliver failed", e);
    }

    return row as ClaimRequest;
  });

export const listMyClaimRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClaimRequestWithTherapist[]> => {
    const { supabase, userId } = context;
    const { data: account, error: accountErr } = await supabase
      .from("therapist_accounts")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (accountErr) throw new Error(accountErr.message);
    if (!account) return [];
    const { data: rows, error } = await supabase
      .from("therapist_claim_requests")
      .select("*, therapists:therapist_id(full_name, slug)")
      .eq("requester_account_id", account.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const t = (r as { therapists: { full_name: string | null; slug: string | null } | null })
        .therapists;
      return {
        ...(r as ClaimRequest),
        therapist_full_name: t?.full_name ?? null,
        therapist_slug: t?.slug ?? null,
      };
    });
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
      .in("status", ["pending", "needs_information"])
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ClaimRequest;
  });

export const getClaimableTherapist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }): Promise<ClaimableTherapist | null> => {
    // Explicit safe projection of a profile the caller does not own; read
    // through the trusted server client because owner-scoped RLS hides it.
    const { trustedReadClient } = await import("./trusted-read-client.server");
    const { data: t, error } = await trustedReadClient()
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

// -----------------------------------------------------------------
// Public professions listing (used by the license-number form).
// -----------------------------------------------------------------
export type ProfessionOption = { id: string; name_he: string; slug: string };

export const listProfessions = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProfessionOption[]> => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data, error } = await sb
      .from("professions")
      .select("id, name_he, slug")
      .eq("is_active", true)
      .order("name_he");
    if (error) throw new Error(error.message);
    return (data ?? []) as ProfessionOption[];
  },
);
