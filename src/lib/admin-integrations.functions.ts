import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";

export type {
  AdminIntegrationCheck,
  AdminIntegrationKey,
  AdminIntegrationStatus,
  IntegrationHealth,
} from "./admin-integrations.types";

const IntegrationHealthInput = z.object({ force: z.boolean().optional().default(false) });

export const getAdminIntegrationStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IntegrationHealthInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בסטטוס האינטגרציות.");
    const { getAdminIntegrationStatusesServer } = await import("./admin-integrations.server");
    return getAdminIntegrationStatusesServer({ force: data.force });
  });
