import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";

export const SUPPORT_STATUSES = ["new", "in_review", "resolved", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export type AdminSupportRequest = {
  id: string;
  accountId: string;
  accountEmail: string | null;
  therapistName: string | null;
  category: "bug" | "complaint" | "suggestion" | "other";
  subject: string;
  message: string;
  status: SupportStatus;
  staffResponse: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export const listAdminSupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSupportRequest[]> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בפניות לצוות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requests, error } = await supabaseAdmin
      .from("account_support_requests")
      .select(
        "id, account_id, category, subject, message, status, staff_response, created_at, updated_at, reviewed_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!requests?.length) return [];

    const accountIds = [...new Set(requests.map((request) => request.account_id))];
    const [{ data: accounts, error: accountsError }, { data: therapists, error: therapistsError }] =
      await Promise.all([
        supabaseAdmin.from("therapist_accounts").select("id, auth_user_id").in("id", accountIds),
        supabaseAdmin
          .from("therapists")
          .select("owner_account_id, full_name")
          .in("owner_account_id", accountIds),
      ]);
    if (accountsError) throw new Error(accountsError.message);
    if (therapistsError) throw new Error(therapistsError.message);

    const accountMap = new Map(
      (accounts ?? []).map((account) => [account.id, account.auth_user_id]),
    );
    const therapistMap = new Map(
      (therapists ?? []).map((therapist) => [therapist.owner_account_id, therapist.full_name]),
    );
    const emailEntries = await Promise.all(
      [...accountMap.entries()].map(async ([accountId, authUserId]) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(authUserId);
        return [accountId, data.user?.email ?? null] as const;
      }),
    );
    const emailMap = new Map(emailEntries);

    return requests.map((request) => ({
      id: request.id,
      accountId: request.account_id,
      accountEmail: emailMap.get(request.account_id) ?? null,
      therapistName: therapistMap.get(request.account_id) ?? null,
      category: request.category as AdminSupportRequest["category"],
      subject: request.subject,
      message: request.message,
      status: request.status as SupportStatus,
      staffResponse: request.staff_response,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      reviewedAt: request.reviewed_at,
    }));
  });

const ReviewSupportSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(SUPPORT_STATUSES),
  staffResponse: z.string().trim().max(2000).nullable(),
});

export const reviewAdminSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewSupportSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לטיפול בפניות לצוות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("account_support_requests")
      .update({
        status: data.status,
        staff_response: data.staffResponse || null,
        reviewed_by: context.userId,
        reviewed_at: now,
      })
      .eq("id", data.requestId)
      .select("id, account_id, subject")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("הפנייה אינה זמינה לטיפול.");

    const statusLabel: Record<SupportStatus, string> = {
      new: "חדשה",
      in_review: "בטיפול",
      resolved: "נפתרה",
      closed: "נסגרה",
    };
    try {
      const { sendSupportStatusNotification } = await import("./account-notifications.server");
      await sendSupportStatusNotification({
        accountId: updated.account_id,
        requestId: updated.id,
        notificationKey: now,
        subject: updated.subject,
        statusLabel: statusLabel[data.status],
        staffResponse: data.staffResponse,
      });
    } catch (notificationError) {
      console.error("[account-notification] support status failed", {
        requestId: updated.id,
        error: notificationError instanceof Error ? notificationError.message : "unknown_error",
      });
    }

    return { ok: true as const };
  });
