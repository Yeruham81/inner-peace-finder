import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SupportRequestSchema = z.object({
  category: z.enum(["bug", "complaint", "suggestion", "other"]),
  subject: z.string().trim().min(3, "נא להזין נושא בן 3 תווים לפחות.").max(120, "הנושא ארוך מדי."),
  message: z
    .string()
    .trim()
    .min(10, "נא להזין פירוט בן 10 תווים לפחות.")
    .max(4000, "הפירוט ארוך מדי."),
});

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
