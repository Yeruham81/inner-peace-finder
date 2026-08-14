import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ProfileStorageBucket = "therapist-credentials" | "therapist-images";

async function withRetry<T>(label: string, work: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw new Error(
    `${label}: ${lastError instanceof Error ? lastError.message : "שגיאה לא ידועה"}`,
  );
}

async function removeStorageFolder(bucket: ProfileStorageBucket, folder: string) {
  const listed = await supabaseAdmin.storage.from(bucket).list(folder, { limit: 1000 });
  if (listed.error) throw new Error(`לא ניתן למחוק קבצים מהמאגר ${bucket}: ${listed.error.message}`);

  const paths = (listed.data ?? []).filter((file) => file.name).map((file) => `${folder}/${file.name}`);

  if (!paths.length) return;

  const removed = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (removed.error) throw new Error(`לא ניתן למחוק קבצים מהמאגר ${bucket}: ${removed.error.message}`);
}

export async function setOwnedProfileVisibility(accountId: string, visible: boolean) {
  const { data: profile, error } = await supabaseAdmin
    .from("therapists")
    .select("id, profile_status")
    .eq("owner_account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("לא נמצא פרופיל לניהול.");
  if (visible && profile.profile_status !== "published") throw new Error("ניתן להפעיל מחדש רק פרופיל שפורסם.");
  const visibility = visible ? ("visible" as const) : ("hidden" as const);
  const updated = await supabaseAdmin.from("therapists").update({ visibility }).eq("id", profile.id);
  if (updated.error) throw new Error(updated.error.message);
  return { visibility };
}

/**
 * Permanent deletion is orchestrated in retryable, idempotent stages so a
 * failure never leaves the profile publicly visible:
 *
 *  1. `begin_therapist_profile_deletion` — one transaction that hides the
 *     profile from the public immediately (visibility hidden, is_active false).
 *  2. Storage cleanup, retried on transient failures.
 *  3. `finalize_therapist_profile_deletion` — one transaction that removes the
 *     profile row (cascading its relations) and resets the account.
 *
 * Re-running the whole flow after any failure is safe: every stage tolerates
 * already-applied state.
 */
export async function permanentlyDeleteOwnedProfile(authUserId: string) {
  const begun = await withRetry("לא ניתן להתחיל מחיקת פרופיל", async () => {
    const { data, error } = await supabaseAdmin.rpc("begin_therapist_profile_deletion", {
      _actor: authUserId,
    });
    if (error) throw new Error(error.message);
    return (data ?? {}) as { therapist_id?: string | null; auth_user_id?: string | null; found?: boolean };
  });

  const therapistId = begun.therapist_id ?? null;
  const storageOwner = begun.auth_user_id ?? authUserId;

  // The profile is already invisible to the public at this point, so storage
  // cleanup failures are retried rather than rolled back.
  await withRetry("לא ניתן למחוק מסמכי הסמכה", () =>
    removeStorageFolder("therapist-credentials", storageOwner),
  );
  if (therapistId) {
    await withRetry("לא ניתן למחוק תמונות פרופיל", () =>
      removeStorageFolder("therapist-images", therapistId),
    );
  }

  await withRetry("לא ניתן להשלים מחיקת פרופיל", async () => {
    const { error } = await supabaseAdmin.rpc("finalize_therapist_profile_deletion", {
      _actor: authUserId,
    });
    if (error) throw new Error(error.message);
  });

  return { deleted: true as const };
}
