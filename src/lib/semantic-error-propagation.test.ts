/**
 * A semantic catalog read failure must surface as an error on the real
 * Unified path — never as "no semantic signals", "unrecognized_query",
 * "no_matching_therapists", or a generic quality-ranked list.
 *
 * The real `SemanticEngine` runs here; only the Supabase reads are doubled.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runUnifiedSearch } from "./query-interpreter.functions";
import { __resetCatalogCache } from "./query-catalog";
import { SemanticEngine } from "./semantic-engine";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { searchFixture } from "./test-support/search-fixture";

const SEMANTIC_QUERY = "פסיכולוג לחרדות ופאניקה";

function client(errors: Record<string, unknown> = {}) {
  return createFakeSupabase(searchFixture(), errors) as unknown as SupabaseClient<Database>;
}

beforeEach(() => __resetCatalogCache());

describe("SemanticEngine database-error propagation", () => {
  it("baseline: the semantic query succeeds and reads the semantic catalog", async () => {
    const sb = client();
    const out = await runUnifiedSearch({ query: SEMANTIC_QUERY, explicit: {}, limit: 20 }, sb);
    const reads = (sb as unknown as { reads: string[] }).reads;
    expect(reads).toContain("problems");
    expect(reads).toContain("problem_aliases");
    expect(reads).toContain("problem_intents");
    expect(out.plan.interpretation.semanticRemainder.length).toBeGreaterThan(0);
  });

  for (const table of ["problems", "problem_aliases", "problem_intents"]) {
    it(`a '${table}' read error propagates out of the Unified path`, async () => {
      const boom = new Error(`${table} read failed`);
      await expect(
        runUnifiedSearch(
          { query: SEMANTIC_QUERY, explicit: {}, limit: 20 },
          client({ [table]: boom }),
        ),
      ).rejects.toThrow(`${table} read failed`);
    });
  }

  it("SemanticEngine.classify itself throws rather than returning zero signals", async () => {
    const boom = new Error("problems read failed");
    await expect(
      SemanticEngine.classify("חרדות ופאניקה", client({ problems: boom })),
    ).rejects.toThrow("problems read failed");
  });

  it("a therapist-side read error is not degraded into an empty result either", async () => {
    const boom = new Error("therapists read failed");
    await expect(
      runUnifiedSearch(
        { query: "", explicit: { city: "חיפה" }, limit: 20 },
        client({ therapists: boom }),
      ),
    ).rejects.toThrow("therapists read failed");
  });
});
