import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";
import type { CredentialStatus } from "./credential-workflow";

export type AdminCredentialRow = {
  id: string;
  therapistId: string;
  therapistName: string;
  ownerAccountId: string | null;
  professionName: string | null;
  credentialType: string;
  institution: string | null;
  licenseNumber: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  status: CredentialStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  documentAvailable: boolean;
};

type JoinedTherapist = {
  full_name?: string | null;
  owner_account_id?: string | null;
};

type JoinedProfession = { name_he?: string | null };

function firstJoin<T>(value: unknown): T {
  return (Array.isArray(value) ? value[0] : (value ?? {})) as T;
}

async function cleanupVerifiedCredentialDocument(credentialId: string, documentPath: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: removeError } = await supabaseAdmin.storage.from("therapist-credentials").remove([documentPath]);
  if (removeError) {
    console.error("[credential-review] verified document cleanup failed", {
      credentialId,
      error: removeError.message,
    });
    return false;
  }

  const { error: clearError } = await supabaseAdmin
    .from("therapist_credentials")
    .update({ document_url: null })
    .eq("id", credentialId)
    .eq("verification_status", "verified")
    .eq("document_url", documentPath);
  if (clearError) {
    console.error("[credential-review] verified document reference cleanup failed", {
      credentialId,
      error: clearError.message,
    });
    return false;
  }
  return true;
}

export const listAdminCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCredentialRow[]> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהסמכות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("therapist_credentials")
      .select(
        "id, therapist_id, credential_type, institution, license_number, issuing_authority, issue_date, verification_status, rejection_reason, submitted_at, reviewed_at, document_url, therapists:therapist_id(full_name, owner_account_id), professions:profession_id(name_he)",
      )
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);

    // Retry privacy cleanup for any previously verified credential whose
    // storage deletion failed transiently. Verified documents are never
    // exposed by this endpoint while the cleanup is pending.
    const verifiedDocumentsPendingCleanup = (data ?? []).filter(
      (row) => row.verification_status === "verified" && Boolean(row.document_url),
    );
    await Promise.all(
      verifiedDocumentsPendingCleanup.map((row) => cleanupVerifiedCredentialDocument(row.id, row.document_url!)),
    );

    return (data ?? []).map((raw) => {
      const row = raw as typeof raw & { therapists?: unknown; professions?: unknown };
      const therapist = firstJoin<JoinedTherapist>(row.therapists);
      const profession = firstJoin<JoinedProfession>(row.professions);
      return {
        id: row.id,
        therapistId: row.therapist_id,
        therapistName: therapist.full_name ?? "מטפל/ת",
        ownerAccountId: therapist.owner_account_id ?? null,
        professionName: profession.name_he ?? null,
        credentialType: row.credential_type,
        institution: row.institution,
        licenseNumber: row.license_number,
        issuingAuthority: row.issuing_authority,
        issueDate: row.issue_date,
        status: row.verification_status,
        rejectionReason: row.rejection_reason,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        documentAvailable: row.verification_status !== "verified" && Boolean(row.document_url),
      };
    });
  });

const CredentialIdSchema = z.object({ credentialId: z.string().uuid() });

export const getAdminCredentialDocumentUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CredentialIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה במסמך.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential, error } = await supabaseAdmin
      .from("therapist_credentials")
      .select("document_url, verification_status")
      .eq("id", data.credentialId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (credential?.verification_status === "verified") {
      throw new Error("מסמך של הסמכה שכבר אומתה אינו זמין לצפייה.");
    }
    if (!credential?.document_url) throw new Error("לא צורף מסמך להסמכה.");

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("therapist-credentials")
      .createSignedUrl(credential.document_url, 5 * 60);
    if (signedError) throw new Error(signedError.message);
    return { url: signed.signedUrl };
  });

const ReviewCredentialSchema = z
  .object({
    credentialId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(1000).nullable(),
  })
  .superRefine((value, context) => {
    if (value.decision === "reject" && (!value.reason || value.reason.length < 3)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "יש להזין סיבת דחייה.",
      });
    }
  });

export const reviewAdminCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewCredentialSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לבדיקת הסמכות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: currentError } = await supabaseAdmin
      .from("therapist_credentials")
      .select(
        "id, credential_type, document_url, verification_status, therapists:therapist_id(full_name, owner_account_id)",
      )
      .eq("id", data.credentialId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current || current.verification_status !== "pending_review") {
      throw new Error("הבקשה אינה ממתינה לבדיקה.");
    }

    const approved = data.decision === "approve";
    if (approved && !current.document_url) {
      throw new Error("לא ניתן לאשר הסמכה ללא מסמך מצורף.");
    }

    const now = new Date().toISOString();
    const documentPath = current.document_url;
    const { data: updated, error } = await supabaseAdmin
      .from("therapist_credentials")
      .update({
        verification_status: approved ? "verified" : "rejected",
        rejection_reason: approved ? null : data.reason,
        verified_by: approved ? context.userId : null,
        verified_at: approved ? now : null,
        reviewed_by: context.userId,
        reviewed_at: now,
      })
      .eq("id", data.credentialId)
      .eq("verification_status", "pending_review")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("הבקשה כבר טופלה על ידי מנהל אחר.");

    // The status update above wins the pending-review race first. Only after
    // approval is committed do we delete the evidence object, so a concurrent
    // rejection can never lose its document. The path is cleared only after a
    // successful storage deletion; if storage fails transiently, the next admin
    // list load retries the cleanup while verified documents remain inaccessible.
    if (approved && documentPath) {
      await cleanupVerifiedCredentialDocument(current.id, documentPath);
    }

    const therapist = firstJoin<JoinedTherapist>((current as typeof current & { therapists?: unknown }).therapists);
    if (therapist.owner_account_id) {
      try {
        const { sendCredentialStatusNotification } = await import("./account-notifications.server");
        await sendCredentialStatusNotification({
          accountId: therapist.owner_account_id,
          credentialId: current.id,
          notificationKey: now,
          therapistName: therapist.full_name ?? "מטפל/ת",
          credentialType: current.credential_type,
          approved,
          rejectionReason: approved ? null : data.reason,
        });
      } catch (notificationError) {
        console.error("[account-notification] credential status failed", {
          credentialId: current.id,
          error: notificationError instanceof Error ? notificationError.message : "unknown_error",
        });
      }
    }

    return { ok: true as const, status: approved ? ("verified" as const) : ("rejected" as const) };
  });
