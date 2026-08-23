import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const AnalyticsEventNameSchema = z.enum([
  "search_executed",
  "therapist_results_rendered",
  "therapist_card_viewed",
  "therapist_profile_viewed",
  "cta_shown",
  "cta_clicked",
  "no_results_returned",
  "anti_spam_passed",
  "lead_created",
  "lead_delivered",
  "lead_rate_limited",
  "search_clarification_shown",
  "search_clarification_chosen",
]);

const PublicAnalyticsSchema = z.object({
  eventName: AnalyticsEventNameSchema,
  therapistId: z.string().uuid().nullable(),
  problemId: z.string().uuid().nullable(),
  populationId: z.string().uuid().nullable(),
  rankPosition: z.number().int().min(0).max(5000).nullable(),
  pageSource: z.string().trim().min(1).max(80).nullable(),
});

export const recordPublicAnalyticsEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PublicAnalyticsSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const { deriveRequestIdentity } = await import("./lead-challenge.server");
    const identity = deriveRequestIdentity(request?.headers);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: recorded, error } = await supabaseAdmin.rpc("record_public_analytics_event", {
      _event_name: data.eventName,
      _session_hash: identity.sessionHash,
      _identity_hash: identity.ipHash,
      _therapist_id: data.therapistId ?? (null as unknown as string),
      _problem_id: data.problemId ?? (null as unknown as string),
      _population_id: data.populationId ?? (null as unknown as string),
      _rank_position: data.rankPosition ?? (null as unknown as number),
      _page_source: data.pageSource ?? (null as unknown as string),
    });
    if (error) throw new Error(error.message);
    return { recorded: Boolean(recorded) };
  });
