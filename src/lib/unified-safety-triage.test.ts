/** Production-path proof that urgent safety triage happens before any catalog,
 * LLM/fallback, eligibility or therapist read. */
import { beforeEach, describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runUnifiedSearch } from "./query-interpreter.functions";
import { __resetCatalogCache } from "./query-catalog";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { searchFixture } from "./test-support/search-fixture";

beforeEach(() => __resetCatalogCache());

describe("Unified Search safety-first orchestration", () => {
  it("short-circuits an urgent self-harm query before every database read", async () => {
    const sb = createFakeSupabase(searchFixture()) as unknown as SupabaseClient<Database>;
    const out = await runUnifiedSearch(
      { query: "יש לי מחשבות אובדניות ואני רוצה למות", explicit: {}, limit: 20 },
      sb,
    );

    expect(out.results).toEqual([]);
    expect(out.emptyReason).toBe("urgent_help");
    expect(out.plan.safetyTriage).toEqual({
      status: "urgent",
      reason: "self_harm_or_suicide",
    });
    expect(out.plan.interpretation.raw).toBe("");
    expect(out.plan.interpretation.normalized).toBe("");
    expect((sb as unknown as { reads: string[] }).reads).toEqual([]);
  });

  it("does not block ambiguous distress before contextual interpretation", async () => {
    const sb = createFakeSupabase(searchFixture()) as unknown as SupabaseClient<Database>;
    const out = await runUnifiedSearch(
      { query: "לא יכולה יותר מהלחץ", explicit: {}, limit: 20 },
      sb,
    );
    expect(out.plan.safetyTriage?.status).toBe("watch");
    expect(out.emptyReason).not.toBe("urgent_help");
    expect((sb as unknown as { reads: string[] }).reads.length).toBeGreaterThan(0);
  });
});
