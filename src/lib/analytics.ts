import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEventName =
  | "search_executed"
  | "therapist_results_rendered"
  | "therapist_card_viewed"
  | "cta_shown"
  | "cta_clicked"
  | "no_results_returned"
  | "anti_spam_passed"
  | "lead_created"
  | "lead_delivered"
  | "lead_rate_limited"
  | "search_clarification_shown"
  | "search_clarification_chosen";

export type AnalyticsPayload = {
  therapist_id?: string | null;
  problem_id?: string | null;
  population_id?: string | null;
  rank_position?: number | null;
  page_source?: string | null;
  /** Problem slug, used for clarification analytics. */
  problem_slug?: string | null;
  /** Component / call-site origin, debug-only (never written to DB). */
  origin?: string | null;
};

const SID_KEY = "mt_sid";

/** Module-level cache so re-renders never regenerate the session id. */
let cachedSessionId: string | null = null;
let sessionIdSource: "cookie" | "localStorage" | "fallback-memory" | "ssr" = "ssr";

/** In-memory dedupe map: key -> last fired timestamp (ms). */
const lastFiredAt = new Map<string, number>();
const DEDUPE_WINDOWS_MS: Partial<Record<AnalyticsEventName, number>> = {
  therapist_card_viewed: 5_000,
};

function isDebug(): boolean {
  if (import.meta.env.VITE_ANALYTICS_DEBUG === "true") return true;
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("analytics_debug") === "1") {
      return true;
    }
  } catch {
    // localStorage may be unavailable in restricted browser environments.
  }
  return false;
}

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
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === "undefined") return "ssr";
  const fromCookie = readCookie(SID_KEY);
  if (fromCookie) {
    cachedSessionId = fromCookie;
    sessionIdSource = "cookie";
    return fromCookie;
  }
  try {
    const existing = window.localStorage.getItem(SID_KEY);
    if (existing) {
      cachedSessionId = existing;
      sessionIdSource = "localStorage";
      // mirror to cookie for the server-side CTA dedupe
      try {
        document.cookie = `${SID_KEY}=${encodeURIComponent(existing)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      } catch {}
      return existing;
    }
    const fresh = genId();
    window.localStorage.setItem(SID_KEY, fresh);
    try {
      document.cookie = `${SID_KEY}=${encodeURIComponent(fresh)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch {}
    cachedSessionId = fresh;
    sessionIdSource = "localStorage";
    return fresh;
  } catch {
    const fresh = genId();
    cachedSessionId = fresh;
    sessionIdSource = "fallback-memory";
    return fresh;
  }
}

export function getSessionIdSource() {
  // Make sure the source is populated even if no one called getSessionId yet.
  getSessionId();
  return sessionIdSource;
}

/**
 * Fire-and-forget analytics. Must never block UI or throw.
 */
export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  try {
    const sessionId = getSessionId();

    // Time-window dedupe (e.g. therapist_card_viewed same therapist within 5s)
    const window_ms = DEDUPE_WINDOWS_MS[event];
    if (window_ms) {
      const key = `${event}|${sessionId}|${payload.therapist_id ?? ""}|${payload.problem_id ?? ""}`;
      const prev = lastFiredAt.get(key);
      const now = Date.now();
      if (prev && now - prev < window_ms) {
        if (isDebug()) {
          console.debug("[analytics] DEDUPED", { event, key, sinceMs: now - prev, payload });
        }
        return;
      }
      lastFiredAt.set(key, now);
    }

    const row = {
      event_name: event,
      session_id: sessionId,
      therapist_id: payload.therapist_id ?? null,
      problem_id: payload.problem_id ?? null,
      population_id: payload.population_id ?? null,
      rank_position: payload.rank_position ?? null,
      page_source: payload.page_source ?? null,
    };

    if (isDebug()) {
      console.debug("[analytics]", event, {
        ...row,
        origin: payload.origin ?? null,
        sessionIdSource,
      });
    }

    // Intentionally not awaited
    void supabase
      .from("analytics_events")
      .insert(row)
      .then(({ error }) => {
        if (error) {
          console.debug("[analytics] insert failed", error.message);
        }
      });
  } catch (err) {
    console.debug("[analytics] threw", err);
  }
}
