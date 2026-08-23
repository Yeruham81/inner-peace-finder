import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MonthlyBudgetSnapshot = {
  therapist_id: string | null;
  month_start: string;
  next_month_at: string;
  monthly_limit_agorot: number | null;
  notify_on_exhaustion: boolean;
  spent_agorot: number;
  reserved_agorot: number;
  remaining_agorot: number | null;
  lead_price_agorot: number | null;
  pricing_active: boolean;
  is_budget_paused: boolean;
  budget_hold_until: string | null;
  notification_pending: boolean;
};

function monthlyBudgetSnapshot(value: unknown): MonthlyBudgetSnapshot {
  if (!value || typeof value !== "object") throw new Error("לא ניתן לקרוא את נתוני התקציב.");
  return value as MonthlyBudgetSnapshot;
}

export const getMyMonthlyBudget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_monthly_budget");
    if (error) throw new Error(error.message);
    return monthlyBudgetSnapshot(data);
  });

const MonthlyBudgetInput = z.object({
  monthlyLimitAgorot: z.number().int().positive().nullable(),
  notifyOnExhaustion: z.boolean(),
});

export const updateMyMonthlyBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MonthlyBudgetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("set_my_monthly_budget", {
      _monthly_limit_agorot: data.monthlyLimitAgorot,
      _notify_on_exhaustion: data.notifyOnExhaustion,
    });
    if (error) throw new Error(error.message);
    const snapshot = monthlyBudgetSnapshot(updated);

    if (snapshot.notification_pending && snapshot.therapist_id) {
      try {
        const { sendBudgetExhaustedNotification } = await import("./billing-budget.server");
        await sendBudgetExhaustedNotification(snapshot.therapist_id);
      } catch (notificationError) {
        console.error("[billing-budget] notification dispatch failed", {
          therapistId: snapshot.therapist_id,
          error: notificationError instanceof Error ? notificationError.message : "unknown_error",
        });
      }
    }
    return snapshot;
  });

export const setMyTestPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("set_my_test_payment_method", {
      _enabled: data.enabled,
    });
    if (error) {
      if (error.message.includes("admin_required")) {
        throw new Error("אפשרות זו זמינה רק למנהל מערכת.");
      }
      throw new Error(error.message);
    }
    return updated as {
      payment_method_status: "not_configured" | "active";
      payment_method_kind: "none" | "test";
    };
  });
