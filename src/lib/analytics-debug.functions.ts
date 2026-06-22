import { createServerFn } from "@tanstack/react-start";

/**
 * Debug-only: returns the most recent ~200 analytics events grouped by session_id.
 * Disabled unless ANALYTICS_DEBUG=true on the server. Returns at most 20 sessions.
 */
export const getRecentAnalyticsBySession = createServerFn({ method: "GET" }).handler(async () => {
  if (process.env.ANALYTICS_DEBUG !== "true") {
    return { enabled: false as const, sessions: [] };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("analytics_events")
    .select(
      "id, event_name, session_id, therapist_id, problem_id, population_id, rank_position, page_source, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const bySession = new Map<string, typeof data>();
  for (const row of data ?? []) {
    const arr = bySession.get(row.session_id) ?? [];
    arr.push(row);
    bySession.set(row.session_id, arr);
  }
  const sessions = Array.from(bySession.entries())
    .slice(0, 20)
    .map(([session_id, events]) => ({
      session_id,
      event_count: events!.length,
      last_event_at: events![0]?.created_at ?? null,
      events: events!.slice(0, 50),
    }));

  return { enabled: true as const, sessions };
});