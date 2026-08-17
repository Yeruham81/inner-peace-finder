import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TherapistAccount = {
  id: string;
  auth_user_id: string;
  onboarding_completed: boolean;
  account_status: "pending" | "active" | "claimed" | "suspended";
  created_at: string;
  updated_at: string;
  owned_therapist_id: string | null;
};

/**
 * Ensures the currently signed-in user has a therapist_accounts row.
 * Idempotent: safe to call on every sign-in. Runs under RLS as the user;
 * the "Account owner can insert self" policy restricts auth_user_id to
 * auth.uid().
 */
export const ensureTherapistAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TherapistAccount> => {
    const { supabase, userId } = context;

    const { data: existing, error: readErr } = await supabase
      .from("therapist_accounts")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    let account = existing;
    if (!account) {
      const { data: inserted, error: insErr } = await supabase
        .from("therapist_accounts")
        .insert({ auth_user_id: userId })
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message);
      account = inserted;
    }

    // Optional owned therapist profile (via nullable owner_account_id FK)
    const { data: owned, error: ownedErr } = await supabase
      .from("therapists")
      .select("id")
      .eq("owner_account_id", account.id)
      .maybeSingle();
    if (ownedErr) throw new Error(ownedErr.message);

    return { ...(account as TherapistAccount), owned_therapist_id: owned?.id ?? null };
  });

