import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "../..");
const read = (...parts: string[]) => readFileSync(resolve(projectRoot, ...parts), "utf8");

const migration = read("supabase/migrations/20260824211000_analytics_ingestion_hardening.sql");
const browserAnalytics = read("src/lib/analytics.ts");
const serverAnalytics = read("src/lib/analytics.functions.ts");
const therapistCard = read("src/components/therapist-card.tsx");

describe("public analytics ingestion hardening", () => {
  it("removes browser inserts and exposes the database writer only to service role", () => {
    expect(migration).toContain(
      "revoke insert on table public.analytics_events from anon, authenticated",
    );
    expect(migration).toContain('drop policy if exists "Anyone can insert analytics events"');
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(browserAnalytics).not.toContain('.from("analytics_events")');
    expect(browserAnalytics).toContain("recordPublicAnalyticsEvent");
  });

  it("derives identities on the server and validates event payloads", () => {
    expect(serverAnalytics).toContain("getRequest()");
    expect(serverAnalytics).toContain("deriveRequestIdentity");
    expect(serverAnalytics).toContain("identity.sessionHash");
    expect(serverAnalytics).toContain("identity.ipHash");
    expect(serverAnalytics).toContain("AnalyticsEventNameSchema");
    expect(serverAnalytics).toContain(".max(80)");
    expect(serverAnalytics).not.toContain("sessionId:");
  });

  it("rate-limits, serializes and deduplicates analytics ingestion in the database", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_recent_count >= 120");
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain("interval '10 seconds'");
    expect(migration).toContain("char_length(_session_hash) <> 64");
    expect(migration).toContain("char_length(_identity_hash) <> 64");
    expect(migration).toContain("therapist.profile_status = 'published'");
    expect(migration).toContain("therapist.do_not_republish = false");
  });

  it("counts a card view only after at least half of the card is visible", () => {
    expect(therapistCard).toContain("IntersectionObserver");
    expect(therapistCard).toContain("entry.intersectionRatio >= 0.5");
    expect(therapistCard).toContain("threshold: [0.5]");
    expect(therapistCard).toContain('track("therapist_card_viewed"');
  });
});
