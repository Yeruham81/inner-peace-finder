import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { getRecentAnalyticsBySession } from "@/lib/analytics-debug.functions";
import {
  assertSessionConsistency,
  computeCtaIntegrity,
  detectRapidDuplicates,
  installDebugGlobals,
  type AnalyticsRow,
} from "@/lib/analytics-validation";
import { getSessionId, getSessionIdSource } from "@/lib/analytics";

function isDebug(): boolean {
  try {
    if ((import.meta as any)?.env?.VITE_ANALYTICS_DEBUG === "true") return true;
  } catch {}
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("analytics_debug") === "1") return true;
  } catch {}
  return false;
}

export function AnalyticsDebugPanel() {
  if (!isDebug()) return null;
  return <AnalyticsDebugPanelInner />;
}

function AnalyticsDebugPanelInner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [sid, setSid] = useState<string>("");
  const [source, setSource] = useState<string>("");

  useEffect(() => {
    installDebugGlobals();
    setSid(assertSessionConsistency("debug-panel-mount"));
    setSource(getSessionIdSource());
    const unsub = router.subscribe("onResolved", () => {
      assertSessionConsistency("router-onResolved");
    });
    return () => unsub();
  }, [router]);

  async function refresh() {
    try {
      const res = await getRecentAnalyticsBySession();
      setEnabled(res.enabled);
      if (!res.enabled) return;
      const current = getSessionId();
      const session = res.sessions.find((s) => s.session_id === current);
      setRows((session?.events as AnalyticsRow[]) ?? []);
    } catch (err) {
      console.debug("[debug-panel] refresh failed", err);
    }
  }

  useEffect(() => {
    if (!open) return;
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [open]);

  const ordered = [...rows].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const dupes = detectRapidDuplicates(ordered);
  const cta = computeCtaIntegrity(ordered);
  const ctaFailures = cta.filter((c) => c.duplicate);

  return (
    <div
      dir="ltr"
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 9999,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        maxWidth: open ? 480 : 200,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: ctaFailures.length || dupes.length ? "#b91c1c" : "#111827",
          color: "white",
          padding: "6px 10px",
          borderRadius: 6,
          border: 0,
          cursor: "pointer",
        }}
      >
        analytics-debug {open ? "▾" : "▸"}{" "}
        {ctaFailures.length ? `⚠ ${ctaFailures.length} CTA dup` : dupes.length ? `⚠ ${dupes.length}` : "ok"}
      </button>
      {open && (
        <div
          style={{
            background: "rgba(17,24,39,0.96)",
            color: "#e5e7eb",
            padding: 10,
            borderRadius: 8,
            marginTop: 6,
            maxHeight: 360,
            overflow: "auto",
          }}
        >
          {!enabled && (
            <div style={{ color: "#fbbf24" }}>
              server ANALYTICS_DEBUG=false — events not fetched
            </div>
          )}
          <div>
            session_id: <span style={{ color: "#93c5fd" }}>{sid}</span> ({source})
          </div>
          <div style={{ marginTop: 6 }}>
            events ({ordered.length}):
            <ol style={{ margin: "4px 0 0 14px", padding: 0 }}>
              {ordered.map((r) => (
                <li key={r.id} style={{ color: dupes.includes(r) ? "#fca5a5" : "#e5e7eb" }}>
                  {r.event_name}
                  {r.therapist_id ? ` t=${r.therapist_id.slice(0, 6)}` : ""}
                  {r.page_source ? ` @${r.page_source}` : ""}
                </li>
              ))}
            </ol>
          </div>
          <div style={{ marginTop: 6 }}>
            cta per therapist:
            <ul style={{ margin: "4px 0 0 14px", padding: 0 }}>
              {cta.length === 0 && <li>(none)</li>}
              {cta.map((c) => (
                <li key={c.therapist_id} style={{ color: c.duplicate ? "#fca5a5" : "#86efac" }}>
                  {c.therapist_id.slice(0, 8)} → {c.clicks} {c.duplicate ? "DUPLICATE" : "ok"}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ marginTop: 6, color: "#9ca3af" }}>
            run <code>mtDebug.simulateRapidCTA("&lt;therapist_id&gt;", 10)</code> in console.
          </div>
          <button
            onClick={refresh}
            style={{ marginTop: 6, background: "#374151", color: "white", border: 0, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}
          >
            refresh
          </button>
        </div>
      )}
    </div>
  );
}