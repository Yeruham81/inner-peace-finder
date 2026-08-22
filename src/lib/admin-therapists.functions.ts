import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminTherapistRow = {
  id: string;
  slug: string;
  fullName: string;
  professionalTitle: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  createdAt: string;
  profileStatus: "draft" | "completed" | "published";
  visibility: string;
  isActive: boolean;
  verified: boolean;
  profileOrigin: "self_created" | "admin_public_info";
  ownerAccountId: string | null;
  profileClaimed: boolean;
  firstContactSentAt: string | null;
  ownerReviewedAt: string | null;
  doNotRepublish: boolean;
};

function hasAdminClaim(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const appMetadata = (claims as { app_metadata?: unknown }).app_metadata;
  return Boolean(
    appMetadata &&
      typeof appMetadata === "object" &&
      (appMetadata as { tipulinks_role?: unknown }).tipulinks_role === "admin",
  );
}

function requireAdmin(claims: unknown): void {
  if (!hasAdminClaim(claims)) throw new Error("אין הרשאת מנהל לצפייה בפרופילי המטפלים.");
}

export const listAdminTherapists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminTherapistRow[]> => {
    requireAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("therapists")
      .select(
        "id, slug, full_name, professional_title, email, phone, city, created_at, profile_status, visibility, is_active, verified, profile_origin, owner_account_id, profile_claimed, first_contact_sent_at, owner_reviewed_at, do_not_republish",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      fullName: row.full_name,
      professionalTitle: row.professional_title,
      email: row.email,
      phone: row.phone,
      city: row.city,
      createdAt: row.created_at,
      profileStatus: row.profile_status,
      visibility: row.visibility,
      isActive: row.is_active,
      verified: Boolean(row.verified),
      profileOrigin: row.profile_origin === "admin_public_info" ? "admin_public_info" : "self_created",
      ownerAccountId: row.owner_account_id,
      profileClaimed: Boolean(row.profile_claimed),
      firstContactSentAt: row.first_contact_sent_at,
      ownerReviewedAt: row.owner_reviewed_at,
      doNotRepublish: Boolean(row.do_not_republish),
    }));
  });

const DeleteAdminProfileSchema = z.object({ therapist_id: z.string().uuid() });

async function removeImageFolder(therapistId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const listed = await supabaseAdmin.storage.from("therapist-images").list(therapistId, { limit: 1000 });
  if (listed.error) throw new Error(`לא ניתן למחוק תמונות פרופיל: ${listed.error.message}`);
  const paths = (listed.data ?? []).filter((file) => file.name).map((file) => `${therapistId}/${file.name}`);
  if (!paths.length) return;
  const removed = await supabaseAdmin.storage.from("therapist-images").remove(paths);
  if (removed.error) throw new Error(`לא ניתן למחוק תמונות פרופיל: ${removed.error.message}`);
}

export const deleteAdminManagedTherapist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteAdminProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: begun, error: beginError } = await supabaseAdmin.rpc("begin_admin_public_profile_deletion", {
      _actor: context.userId,
      _therapist_id: data.therapist_id,
    });
    if (beginError) throw new Error(beginError.message);
    if (!begun) throw new Error("הפרופיל אינו זמין למחיקה.");

    // Once begin_* succeeds the profile is hidden and locked against Claim.
    // Storage cleanup can therefore be retried safely if a transient error occurs.
    await removeImageFolder(data.therapist_id);

    const { data: deleted, error: finalizeError } = await supabaseAdmin.rpc(
      "finalize_admin_public_profile_deletion",
      { _actor: context.userId, _therapist_id: data.therapist_id },
    );
    if (finalizeError) throw new Error(finalizeError.message);
    if (!deleted) throw new Error("מחיקת הפרופיל לא הושלמה.");
    return { deleted: true as const, therapist_id: deleted };
  });
