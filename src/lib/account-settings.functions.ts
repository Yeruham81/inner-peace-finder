import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountUpdateNotificationPreference = {
  notify_account_updates: boolean;
};

const PreferenceSchema = z.object({
  notify_account_updates: z.boolean(),
});

export const getMyAccountUpdateNotificationPreference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountUpdateNotificationPreference> => {
    const { data, error } = await context.supabase.rpc("get_my_account_update_notification_preference");
    if (error) throw new Error(error.message);
    if (typeof data !== "boolean") throw new Error("לא נמצאה העדפת עדכוני אימות לחשבון.");
    return { notify_account_updates: data };
  });

export const updateMyAccountUpdateNotificationPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreferenceSchema.parse(input))
  .handler(async ({ data, context }): Promise<AccountUpdateNotificationPreference> => {
    const { data: updated, error } = await context.supabase.rpc("update_my_account_update_notification_preference", {
      _notify_account_updates: data.notify_account_updates,
    });
    if (error) throw new Error(error.message);
    if (typeof updated !== "boolean") throw new Error("לא ניתן לעדכן את העדפת עדכוני האימות.");
    return { notify_account_updates: updated };
  });
