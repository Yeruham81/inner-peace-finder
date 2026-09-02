import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SupportRequestSchema = z.object({
  category: z.enum(["bug", "complaint", "suggestion", "other"]),
  subject: z.string().trim().min(3, "נא להזין נושא בן 3 תווים לפחות.").max(120, "הנושא ארוך מדי."),
  message: z.string().trim().min(10, "נא להזין פירוט בן 10 תווים לפחות.").max(4000, "הפירוט ארוך מדי."),
});

export type MySupportRequest = {
  id: string;
  category: "bug" | "complaint" | "suggestion" | "other";
  subject: string;
  status: "new" | "in_review" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
};

export const submitMySupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SupportRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: requestId, error } = await context.supabase.rpc("submit_my_support_request", {
      _category: data.category,
      _subject: data.subject,
      _message: data.message,
    });
    if (error) throw new Error(error.message);
    return { request_id: requestId };
  });

export const getMySupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySupportRequest[]> => {
    const { data, error } = await context.supabase.rpc("get_my_support_requests");
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map((value) => {
      const row = value as Record<string, unknown>;
      const category: MySupportRequest["category"] =
        row.category === "complaint" || row.category === "suggestion" || row.category === "other"
          ? row.category
          : "bug";
      const status: MySupportRequest["status"] =
        row.status === "in_review" || row.status === "resolved" || row.status === "closed" ? row.status : "new";
      return {
        id: String(row.id ?? ""),
        category,
        subject: String(row.subject ?? ""),
        status,
        created_at: String(row.created_at ?? ""),
        updated_at: String(row.updated_at ?? ""),
      };
    });
  });
