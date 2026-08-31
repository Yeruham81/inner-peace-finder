import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ACCOUNT_DELETION_SUPPORT_EMAIL = "admin@tipulinks.co.il";

export type AccountDeletionStatus =
  | "blocked_pending_leads"
  | "payment_method_required"
  | "payment_required"
  | "payment_processing"
  | "payment_failed"
  | "ready_to_delete";

export type AccountDeletionPreparation = {
  deleted: false;
  request_id: string;
  status: AccountDeletionStatus;
  outstanding_agorot: number;
  pending_reservations: number;
  payment_method_status?: string | null;
  payment_method_kind?: "none" | "real" | "test" | null;
  profile_frozen: true;
  support_email: string;
};

type PaymentClaim = {
  status: AccountDeletionStatus;
  request_id: string;
  payment_attempt_id?: string;
  amount_agorot?: number;
  outstanding_agorot?: number;
  pending_reservations?: number;
  payment_method_kind?: "none" | "real" | "test" | null;
  idempotency_key?: string;
};

type ChargeResult = {
  provider: string;
  providerReference: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function preparationFrom(value: unknown): AccountDeletionPreparation {
  const row = asRecord(value);
  return {
    deleted: false,
    request_id: String(row.request_id ?? ""),
    status: String(row.status ?? "ready_to_delete") as AccountDeletionStatus,
    outstanding_agorot: asNumber(row.outstanding_agorot),
    pending_reservations: asNumber(row.pending_reservations),
    payment_method_status: row.payment_method_status == null ? null : String(row.payment_method_status),
    payment_method_kind:
      row.payment_method_kind === "real" || row.payment_method_kind === "test" || row.payment_method_kind === "none"
        ? row.payment_method_kind
        : null,
    profile_frozen: true,
    support_email: ACCOUNT_DELETION_SUPPORT_EMAIL,
  };
}

/**
 * Charge adapter for the saved payment method.
 *
 * The project currently has a test payment method but no production clearing
 * provider/token charge implementation.  Test mode therefore exercises the
 * complete deletion flow without inventing a successful real-world charge.
 * When a real provider is connected, its tokenized server-side charge belongs
 * here and MUST use `idempotencyKey` at the provider as well.
 */
async function chargeSavedPaymentMethod(input: {
  paymentMethodKind: "real" | "test";
  amountAgorot: number;
  paymentAttemptId: string;
  idempotencyKey: string;
}): Promise<ChargeResult> {
  if (input.paymentMethodKind === "test") {
    return {
      provider: "tipulinks-test",
      providerReference: `test-account-deletion-${input.paymentAttemptId}`,
    };
  }

  throw new Error("real_payment_provider_not_configured");
}

async function prepareDeletion(authUserId: string): Promise<AccountDeletionPreparation> {
  const { data, error } = await supabaseAdmin.rpc("prepare_account_deletion", {
    _actor: authUserId,
  });
  if (error) throw new Error(error.message);
  return preparationFrom(data);
}

export async function beginOwnedAccountDeletion(authUserId: string) {
  return prepareDeletion(authUserId);
}

export async function assertOwnedAccountDeletionReady(authUserId: string) {
  const { data, error } = await supabaseAdmin.rpc("assert_account_deletion_ready", {
    _actor: authUserId,
  });
  if (error) {
    if (error.message.includes("account_deletion_pending_leads")) {
      throw new Error(
        `מחיקת החשבון אינה אפשרית כרגע משום שקיימת פנייה שעדיין נמצאת בתהליך. אם המצב אינו משתנה, יש לפנות לתמיכה: ${ACCOUNT_DELETION_SUPPORT_EMAIL}`,
      );
    }
    const balanceMatch = error.message.match(/account_deletion_balance_due:(\d+)/);
    if (balanceMatch) {
      throw new Error("לא ניתן להשלים את מחיקת החשבון לפני סילוק היתרה הפתוחה.");
    }
    throw new Error(error.message);
  }
  return data;
}

export async function settleOwnedAccountDeletionBalance(authUserId: string, requestId: string) {
  const { data: claimData, error: claimError } = await supabaseAdmin.rpc("claim_account_deletion_payment", {
    _actor: authUserId,
    _request_id: requestId,
  });
  if (claimError) throw new Error(claimError.message);

  const claim = asRecord(claimData) as PaymentClaim;
  const status = String(claim.status ?? "payment_required") as AccountDeletionStatus;

  if (status === "blocked_pending_leads" || status === "payment_method_required" || status === "ready_to_delete") {
    return preparationFrom({ ...claim, status, profile_frozen: true });
  }

  const paymentAttemptId = String(claim.payment_attempt_id ?? "");
  const amountAgorot = asNumber(claim.amount_agorot);
  const idempotencyKey = String(claim.idempotency_key ?? "");
  const paymentMethodKind = claim.payment_method_kind;

  if (
    !paymentAttemptId ||
    !idempotencyKey ||
    amountAgorot <= 0 ||
    (paymentMethodKind !== "real" && paymentMethodKind !== "test")
  ) {
    throw new Error("לא ניתן להתחיל את החיוב המיידי. יש לנסות שוב.");
  }

  try {
    const charge = await chargeSavedPaymentMethod({
      paymentMethodKind,
      amountAgorot,
      paymentAttemptId,
      idempotencyKey,
    });

    const { data: finished, error: finishError } = await supabaseAdmin.rpc("finish_account_deletion_payment", {
      _actor: authUserId,
      _request_id: requestId,
      _payment_attempt_id: paymentAttemptId,
      _success: true,
      _provider: charge.provider,
      _provider_reference: charge.providerReference,
      _error: null,
    });
    if (finishError) throw new Error(finishError.message);

    return preparationFrom({ ...asRecord(finished), profile_frozen: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_failed";

    try {
      await supabaseAdmin.rpc("finish_account_deletion_payment", {
        _actor: authUserId,
        _request_id: requestId,
        _payment_attempt_id: paymentAttemptId,
        _success: false,
        _provider: paymentMethodKind === "test" ? "tipulinks-test" : null,
        _provider_reference: null,
        _error: message,
      });
    } catch {
      // The account remains frozen even if recording the provider failure also fails.
    }

    if (message === "real_payment_provider_not_configured") {
      throw new Error(
        "לא ניתן להשלים כרגע חיוב מיידי באמצעי התשלום השמור. החשבון והפרופיל נשארו מוקפאים ולא יקבלו פניות חדשות.",
      );
    }

    throw new Error(
      "החיוב לא הושלם ולכן החשבון לא נמחק. החשבון והפרופיל נשארו מוקפאים; ניתן להסדיר את אמצעי התשלום ולנסות שוב.",
    );
  }
}
