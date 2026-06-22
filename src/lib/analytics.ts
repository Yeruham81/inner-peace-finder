import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEventName =
  | "search_executed"
  | "therapist_results_rendered"
  | "therapist_card_viewed"
  | "cta_shown"
  | "cta_clicked"
  | "no_results_returned";

export type AnalyticsPayload = {
  therapist_id?: string | null;
  problem_id?: string | null;
  population_id?: string | null;
  rank_position?: number | null;
  page_source?: string | null;
};

const SID_KEY = "mt_sid";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const fromCookie = readCookie(SID_KEY);
  if (fromCookie) return fromCookie;
  try {
    const existing = window.localStorage.getItem(SID_KEY);
    if (existing) return existing;
    const fresh = genId();
    window.localStorage.setItem(SID_KEY, fresh);
    // Best-effort cookie so the server-side CTA dedupe sees the same id
    try {
      document.cookie = `${SID_KEY}=${encodeURIComponent(fresh)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch {}
    return fresh;
  } catch {
    return genId();
  }
}

/**
 * Fire-and-forget analytics. Must never block UI or throw.
 */
export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  try {
    const row = {
      event_name: event,
      session_id: getSessionId(),
      therapist_id: payload.therapist_id ?? null,
      problem_id: payload.problem_id ?? null,
      population_id: payload.population_id ?? null,
      rank_position: payload.rank_position ?? null,
      page_source: payload.page_source ?? null,
    };
    // Intentionally not awaited
    void supabase
      .from("analytics_events")
      .insert(row)
      .then(({ error }) => {
        if (error && typeof console !== "undefined") {
          console.debug("[analytics] insert failed", error.message);
        }
      });
  } catch (err) {
    if (typeof console !== "undefined") console.debug("[analytics] threw", err);
  }
}