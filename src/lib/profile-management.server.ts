import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ProfileStorageBucket = "therapist-credentials" | "therapist-images";

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

export async function permanentlyDeleteOwnedProfile(accountId: string) {
  const { data: account, error: accountError } = await supabaseAdmin
    .from("therapist_accounts")
    .select("auth_user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account) throw new Error("לא נמצא חשבון מטפל למחיקה.");

  const { data: profile, error } = await supabaseAdmin
    .from("therapists")
    .select("id")
    .eq("owner_account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("לא נמצא פרופיל למחיקה.");
  const hidden = await supabaseAdmin.from("therapists").update({ visibility: "hidden" }).eq("id", profile.id);
  if (hidden.error) throw new Error(hidden.error.message);

  await removeStorageFolder("therapist-credentials", account.auth_user_id);
  await removeStorageFolder("therapist-images", profile.id);

  const deleted = await supabaseAdmin.from("therapists").delete().eq("id", profile.id);
  if (deleted.error) throw new Error(deleted.error.message);
  await supabaseAdmin
    .from("therapist_accounts")
    .update({ account_status: "active", onboarding_completed: false })
    .eq("id", accountId);
  return { deleted: true as const };
}
