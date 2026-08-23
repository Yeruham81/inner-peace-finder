import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildProfileOnboardingStatus,
  type PaymentMethodStatus,
  type ProfileOnboardingStatus,
} from "./profile-onboarding";
import type { CredentialStatus } from "./credential-workflow";

const PAYMENT_METHOD_STATUSES = new Set<PaymentMethodStatus>([
  "not_configured",
  "active",
  "action_required",
  "expired",
]);

function paymentMethodStatus(value: unknown): PaymentMethodStatus {
  return PAYMENT_METHOD_STATUSES.has(value as PaymentMethodStatus) ? (value as PaymentMethodStatus) : "not_configured";
}

export const getMyProfileOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileOnboardingStatus> => {
    const { data: account, error: accountError } = await context.supabase
      .from("therapist_accounts")
      .select("id, account_status, credential_verification_skipped_at, payment_method_status")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("חשבון המטפל טרם נוצר.");

    const { data: profile, error: profileError } = await context.supabase
      .from("therapists")
      .select(
        "id, slug, profile_status, is_active, visibility, profile_origin, billing_hold, email, phone, contact_methods, preferred_contact_method",
      )
      .eq("owner_account_id", account.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    let credentials: { verification_status: CredentialStatus; document_url: string | null }[] = [];
    if (profile) {
      const { data, error } = await context.supabase
        .from("therapist_credentials")
        .select("verification_status, document_url")
        .eq("therapist_id", profile.id);
      if (error) throw new Error(error.message);
      credentials = (data ?? []) as typeof credentials;
    }

    return buildProfileOnboardingStatus({
      accountStatus: account.account_status,
      credentialVerificationSkippedAt: account.credential_verification_skipped_at,
      paymentMethodStatus: paymentMethodStatus(account.payment_method_status),
      profile,
      credentials,
    });
  });

export const setMyCredentialVerificationSkip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ skip: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: skippedAt, error } = await context.supabase.rpc("set_my_credential_verification_skip", {
      _skip: data.skip,
    });
    if (error) throw new Error(error.message);
    return { skipped_at: skippedAt };
  });

export const publishMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("publish_my_completed_profile");
    if (error) {
      if (error.message.includes("payment_method_not_active")) {
        throw new Error("יש לעדכן אמצעי תשלום פעיל לפני פרסום הפרופיל.");
      }
      if (error.message.includes("credential_step_incomplete")) {
        throw new Error("יש להשלים את שלב אימות ההסמכות לפני פרסום הפרופיל.");
      }
      if (error.message.includes("contact_step_incomplete")) {
        throw new Error("יש להשלים את דרכי קבלת הפניות לפני פרסום הפרופיל.");
      }
      if (error.message.includes("profile_step_incomplete")) {
        throw new Error("יש להשלים ולשמור את פרטי הפרופיל המקצועי לפני הפרסום.");
      }
      throw new Error(error.message);
    }
    return data as {
      therapist_id: string;
      profile_status: "published";
      visibility: "visible" | "hidden";
      slug: string | null;
    };
  });
