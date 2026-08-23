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
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : "שגיאה לא ידועה"}`);
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
  const [{ data: profile, error }, { data: account, error: accountError }] = await Promise.all([
    supabaseAdmin
      .from("therapists")
      .select("id, profile_status, billing_hold, budget_hold_until, is_active")
      .eq("owner_account_id", accountId)
      .maybeSingle(),
    supabaseAdmin
      .from("therapist_accounts")
      .select("account_status, payment_method_status")
      .eq("id", accountId)
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (accountError) throw new Error(accountError.message);
  if (!profile) throw new Error("לא נמצא פרופיל לניהול.");
  if (visible && profile.profile_status !== "published") throw new Error("ניתן להפעיל מחדש רק פרופיל שפורסם.");
  if (visible && account?.account_status === "suspended") {
    throw new Error("החשבון מושהה. יש לפנות לצוות טיפולינקס לפני הפעלת הפרופיל מחדש.");
  }
  if (visible && (profile.billing_hold || account?.payment_method_status !== "active")) {
    throw new Error("יש לעדכן אמצעי תשלום פעיל לפני הפעלת הפרופיל מחדש.");
  }
  if (visible && profile.budget_hold_until && new Date(profile.budget_hold_until).getTime() > Date.now()) {
    throw new Error("התקציב החודשי נוצל. ניתן להגדיל אותו במסך החיובים או להמתין לחודש הבא.");
  }
  const visibility = visible ? ("visible" as const) : ("hidden" as const);
  const updated = await supabaseAdmin
    .from("therapists")
    .update({ visibility, is_active: visible ? true : profile.is_active })
    .eq("id", profile.id);
  if (updated.error) throw new Error(updated.error.message);
  return { visibility };
}

export async function updateOwnedProfileContactPreferences(
  accountId: string,
  preferences: {
    email: string | null;
    phone: string | null;
    contact_methods: Array<"whatsapp" | "email" | "phone">;
    preferred_contact_method: "whatsapp" | "email" | "phone";
  },
) {
  const { data: profile, error } = await supabaseAdmin
    .from("therapists")
    .select("id")
    .eq("owner_account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("יש לשמור את הפרופיל לפחות פעם אחת לפני הגדרת דרכי התקשרות.");

  const updated = await supabaseAdmin
    .from("therapists")
    .update({
      email: preferences.email,
      phone: preferences.phone,
      contact_methods: preferences.contact_methods,
      preferred_contact_method: preferences.preferred_contact_method,
    })
    .eq("id", profile.id)
    .eq("owner_account_id", accountId);
  if (updated.error) throw new Error(updated.error.message);

  return {
    email: preferences.email,
    phone: preferences.phone,
    contact_methods: preferences.contact_methods,
    preferred_contact_method: preferences.preferred_contact_method,
  };
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
    return (data ?? {}) as {
      therapist_id?: string | null;
      auth_user_id?: string | null;
      found?: boolean;
    };
  });

  const therapistId = begun.therapist_id ?? null;
  const storageOwner = begun.auth_user_id ?? authUserId;

  // The profile is already invisible to the public at this point, so storage
  // cleanup failures are retried rather than rolled back.
  await withRetry("לא ניתן למחוק מסמכי הסמכה", () => removeStorageFolder("therapist-credentials", storageOwner));
  if (therapistId) {
    await withRetry("לא ניתן למחוק תמונות פרופיל", () => removeStorageFolder("therapist-images", therapistId));
  }

  await withRetry("לא ניתן להשלים מחיקת פרופיל", async () => {
    const { error } = await supabaseAdmin.rpc("finalize_therapist_profile_deletion", {
      _actor: authUserId,
    });
    if (error) throw new Error(error.message);
  });

  return { deleted: true as const };
}

/**
 * Records only the email addresses required to honour the no-contact request,
 * removes the user's professional profile, and deletes the Auth user last. If
 * the suppression migration is missing or unavailable, deletion fails before
 * any user data is removed. Other partial failures leave the account available
 * so the user can safely try again.
 */
export async function permanentlyDeleteOwnedAccount(authUserId: string) {
  const [{ data: authData, error: authError }, { data: account, error: accountError }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(authUserId),
    supabaseAdmin.from("therapist_accounts").select("id").eq("auth_user_id", authUserId).maybeSingle(),
  ]);
  if (authError) throw new Error(`לא ניתן לקרוא את חשבון ההתחברות: ${authError.message}`);
  if (accountError) throw new Error(accountError.message);
  if (!account) throw new Error("לא נמצא חשבון למחיקה.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("therapists")
    .select("email")
    .eq("owner_account_id", account.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const suppressionEmails = [...new Set([authData.user?.email, profile?.email].filter(Boolean) as string[])];

  if (suppressionEmails.length > 0) {
    await withRetry("לא ניתן לשמור את בקשת אי־הפנייה", async () => {
      const { error } = await supabaseAdmin.rpc("record_contact_email_suppressions", {
        _emails: suppressionEmails,
        _source: "account_self_deletion",
      });
      if (error) throw new Error(error.message);
    });
  }

  await permanentlyDeleteOwnedProfile(authUserId);

  await withRetry("לא ניתן למחוק את חשבון ההתחברות", async () => {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (error) throw new Error(error.message);
  });

  return { deleted: true as const };
}
