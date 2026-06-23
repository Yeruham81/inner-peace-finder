import { getSessionId, getSessionIdSource, track } from "./analytics";
import { recordCtaClick } from "./therapists.functions";

function isDebug(): boolean {
  try {
    if ((import.meta as any)?.env?.VITE_ANALYTICS_DEBUG === "true") return true;
  } catch {}
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("analytics_debug") === "1") return true;
  } catch {}
  return false;
}

export type AnalyticsRow = {
  id: string;
  event_name: string;
  session_id: string;
  therapist_id: string | null;
  problem_id: string | null;
  population_id: string | null;
  rank_position: number | null;
  page_source: string | null;
  created_at: string;
};

export type CtaIntegrity = {
  therapist_id: string;
  clicks: number;
  duplicate: boolean;
};

/**
 * Compute CTA-click integrity per therapist for a given session.
 * A session with >1 cta_clicked for the same therapist is a dedupe failure.
 */
export function computeCtaIntegrity(rows: AnalyticsRow[]): CtaIntegrity[] {
  const byTherapist = new Map<string, number>();
  for (const r of rows) {
    if (r.event_name !== "cta_clicked" || !r.therapist_id) continue;
    byTherapist.set(r.therapist_id, (byTherapist.get(r.therapist_id) ?? 0) + 1);
  }
  return Array.from(byTherapist.entries()).map(([therapist_id, clicks]) => ({
    therapist_id,
    clicks,
    duplicate: clicks > 1,
  }));
}

/**
 * Flag analytics rows whose (event,therapist,problem) pair fires twice within 2s.
 * Useful for spotting StrictMode / re-render duplicates.
 */
export function detectRapidDuplicates(rows: AnalyticsRow[]): AnalyticsRow[] {
  const sorted = [...rows].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const last = new Map<string, number>();
  const dupes: AnalyticsRow[] = [];
  for (const r of sorted) {
    const key = `${r.event_name}|${r.therapist_id ?? ""}|${r.problem_id ?? ""}`;
    const t = +new Date(r.created_at);
    const prev = last.get(key);
    if (prev !== undefined && t - prev < 2000) dupes.push(r);
    last.set(key, t);
  }
  return dupes;
}

/**
 * Stress test: fire N rapid CTA clicks against the server fn and report
 * how many were marked billable. With dedupe working, exactly 1 should be.
 */
export async function simulateRapidCTA(
  therapistId: string,
  n = 10,
): Promise<{ billable: number; total: number; errors: number }> {
  if (!isDebug()) {
    console.warn("[analytics-validation] simulateRapidCTA disabled (set VITE_ANALYTICS_DEBUG=true)");
    return { billable: 0, total: 0, errors: 0 };
  }
  const results = await Promise.allSettled(
    Array.from({ length: n }, () => {
      track("cta_clicked", {
        therapist_id: therapistId,
        page_source: "stress_test",
        origin: "simulateRapidCTA",
      });
      return recordCtaClick({ data: { therapistId, sourceProblemId: null } });
    }),
  );
  let billable = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "rejected") errors++;
    else if ((r.value as any)?.billable) billable++;
  }
  const report = { billable, total: n, errors };
  console.info("[analytics-validation] simulateRapidCTA", report);
  if (billable !== 1) {
    console.error(
      "[analytics-validation] CTA dedupe FAILED — expected exactly 1 billable click, got",
      billable,
    );
  }
  return report;
}

/**
 * Verify session id is stable across hooks/navigations. Logs a warning on mismatch.
 */
export function assertSessionConsistency(label: string): string {
  const id = getSessionId();
  const w = window as any;
  if (!w.__mt_session_seen) {
    w.__mt_session_seen = { id, source: getSessionIdSource(), labels: [label] };
  } else {
    w.__mt_session_seen.labels.push(label);
    if (w.__mt_session_seen.id !== id) {
      console.warn("[analytics-validation] session_id MISMATCH", {
        previous: w.__mt_session_seen.id,
        current: id,
        labels: w.__mt_session_seen.labels,
      });
    }
  }
  return id;
}

/**
 * Install debug helpers on window for manual console use.
 */
export function installDebugGlobals() {
  if (typeof window === "undefined" || !isDebug()) return;
  const w = window as any;
  w.mtDebug = {
    getSessionId,
    getSessionIdSource,
    simulateRapidCTA,
    computeCtaIntegrity,
    detectRapidDuplicates,
    assertSessionConsistency,
  };
  console.info("[analytics-validation] window.mtDebug installed", Object.keys(w.mtDebug));
}