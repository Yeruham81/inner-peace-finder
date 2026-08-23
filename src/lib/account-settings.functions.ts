import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationPreferences = {
  notify_new_leads: boolean;
  notify_account_updates: boolean;
};

const NotificationPreferencesSchema = z.object({
  notify_new_leads: z.boolean(),
  notify_account_updates: z.boolean(),
});

export const getMyNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPreferences> => {
    const { data, error } = await context.supabase.rpc("get_my_notification_preferences");
    if (error) throw new Error(error.message);
    const preferences = data?.[0];
    if (!preferences) throw new Error("לא נמצאו העדפות התראות לחשבון.");
    return preferences;
  });

export const updateMyNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NotificationPreferencesSchema.parse(input))
  .handler(async ({ data, context }): Promise<NotificationPreferences> => {
    const { data: updated, error } = await context.supabase.rpc(
      "update_my_notification_preferences",
      {
        _notify_new_leads: data.notify_new_leads,
        _notify_account_updates: data.notify_account_updates,
      },
    );
    if (error) throw new Error(error.message);
    const preferences = updated?.[0];
    if (!preferences) throw new Error("לא ניתן לעדכן את העדפות ההתראות.");
    return preferences;
  });
