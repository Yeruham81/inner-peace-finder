import type { CredentialStatus } from "./credential-workflow";

export type PaymentMethodStatus = "not_configured" | "active" | "action_required" | "expired";
export type CredentialOnboardingState =
  "not_started" | "submitted" | "verified" | "skipped" | "action_required";
export type OnboardingStepState = "complete" | "incomplete" | "action_required";
export type OwnershipMode = "account_only" | "self_created" | "claimed";

export type ProfileOnboardingStatus = {
  ownershipMode: OwnershipMode;
  accountStatus: "pending" | "active" | "claimed" | "suspended";
  credentialState: CredentialOnboardingState;
  paymentMethodStatus: PaymentMethodStatus;
  steps: {
    account: OnboardingStepState;
    profile: OnboardingStepState;
    credentials: OnboardingStepState;
    contact: OnboardingStepState;
    payment: OnboardingStepState;
  };
  completedCount: number;
  totalCount: 5;
  allStepsComplete: boolean;
  isPublished: boolean;
  isPublic: boolean;
  isBillingPaused: boolean;
  profileSlug: string | null;
};

type CredentialInput = {
  verification_status: CredentialStatus;
  document_url?: string | null;
};

type ProfileInput = {
  slug: string | null;
  profile_status: "draft" | "completed" | "published";
  is_active: boolean;
  visibility: string;
  profile_origin: string;
  billing_hold?: boolean | null;
  email: string | null;
  phone: string | null;
  contact_methods: string[] | null;
  preferred_contact_method: string | null;
} | null;

export type BuildProfileOnboardingInput = {
  accountStatus: ProfileOnboardingStatus["accountStatus"];
  credentialVerificationSkippedAt: string | null;
  paymentMethodStatus: PaymentMethodStatus;
  profile: ProfileInput;
  credentials: CredentialInput[];
};

export function deriveCredentialOnboardingState(
  credentials: CredentialInput[],
  skippedAt: string | null,
): CredentialOnboardingState {
  if (credentials.some((credential) => credential.verification_status === "verified"))
    return "verified";
  if (
    credentials.some(
      (credential) =>
        credential.verification_status === "pending_review" ||
        (credential.verification_status === "unverified" && Boolean(credential.document_url)),
    )
  ) {
    return "submitted";
  }
  if (
    credentials.some(
      (credential) =>
        credential.verification_status === "rejected" ||
        credential.verification_status === "expired",
    )
  ) {
    return "action_required";
  }
  if (skippedAt) return "skipped";
  return "not_started";
}

export function hasConfiguredContact(profile: ProfileInput): boolean {
  if (!profile) return false;
  const methods = (profile.contact_methods ?? []).filter(
    (method) => method === "email" || method === "whatsapp" || method === "phone",
  );
  if (methods.length === 0 || !profile.preferred_contact_method) return false;
  if (!methods.some((method) => method === profile.preferred_contact_method)) return false;
  if (methods.includes("email") && !profile.email?.trim()) return false;
  if ((methods.includes("whatsapp") || methods.includes("phone")) && !profile.phone?.trim())
    return false;
  return true;
}

function stepForCredential(state: CredentialOnboardingState): OnboardingStepState {
  if (state === "action_required") return "action_required";
  return state === "not_started" ? "incomplete" : "complete";
}

function stepForPayment(status: PaymentMethodStatus): OnboardingStepState {
  if (status === "action_required" || status === "expired") return "action_required";
  return status === "active" ? "complete" : "incomplete";
}

export function buildProfileOnboardingStatus(
  input: BuildProfileOnboardingInput,
): ProfileOnboardingStatus {
  const credentialState = deriveCredentialOnboardingState(
    input.credentials,
    input.credentialVerificationSkippedAt,
  );
  const ownershipMode: OwnershipMode = !input.profile
    ? "account_only"
    : input.profile.profile_origin === "admin_public_info"
      ? "claimed"
      : "self_created";
  const isPublished = input.profile?.profile_status === "published";
  const isBillingPaused = Boolean(input.profile?.billing_hold);
  const isPublic = Boolean(
    isPublished &&
    input.profile?.is_active &&
    (input.profile.visibility === "visible" || input.profile.visibility === "published") &&
    !isBillingPaused,
  );
  const steps: ProfileOnboardingStatus["steps"] = {
    account: input.accountStatus === "suspended" ? "action_required" : "complete",
    profile: input.profile && input.profile.profile_status !== "draft" ? "complete" : "incomplete",
    credentials: stepForCredential(credentialState),
    contact: hasConfiguredContact(input.profile) ? "complete" : "incomplete",
    payment: stepForPayment(input.paymentMethodStatus),
  };
  const completedCount = Object.values(steps).filter((step) => step === "complete").length;

  return {
    ownershipMode,
    accountStatus: input.accountStatus,
    credentialState,
    paymentMethodStatus: input.paymentMethodStatus,
    steps,
    completedCount,
    totalCount: 5,
    allStepsComplete: completedCount === 5,
    isPublished,
    isPublic,
    isBillingPaused,
    profileSlug: input.profile?.slug ?? null,
  };
}
