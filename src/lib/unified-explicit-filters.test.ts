/**
 * Production-path regression suite for explicit UI filters.
 *
 * These tests call the REAL `runUnifiedSearch` orchestrator (the function
 * the `unifiedSearch` server function delegates to) with an in-memory
 * Supabase double, so the real catalog loader, the real interpreter, the
 * real explicit-filter validator and the real deterministic executor all
 * run. No hand-built `TherapistSearchPlan` is used.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runUnifiedSearch } from "./query-interpreter.functions";
import { __resetCatalogCache } from "./query-catalog";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { searchFixture } from "./test-support/search-fixture";

function client() {
  return createFakeSupabase(searchFixture()) as unknown as SupabaseClient<Database>;
}

function run(query: string, explicit: { city?: string; population?: string; language?: string } = {}) {
  return runUnifiedSearch({ query, explicit, limit: 20 }, client());
}

beforeEach(() => __resetCatalogCache());

describe("unified search — explicit UI filters on the real production path", () => {
  it("uses an active canonical homepage problem instead of reclassifying its label", async () => {
    const fixture = searchFixture();
    fixture.problems.push({
      id: "sleep",
      slug: "sleep_difficulties",
      name: "קשיי שינה",
      is_active: true,
    });
    const haifa = fixture.therapists.find((therapist) => therapist.id === "t-haifa")!;
    haifa.semantic_profile = [{ slug: "sleep_difficulties", weight: 1 }];
    const out = await runUnifiedSearch(
      {
        query: "קשיי שינה",
        problemSlugs: ["sleep_difficulties"],
        explicit: { population: "children" },
        limit: 20,
      },
      createFakeSupabase(fixture) as unknown as SupabaseClient<Database>,
    );
    expect(out.plan.semanticSignals).toEqual([{ slug: "sleep_difficulties", confidence: 1 }]);
    expect(out.results.map((result) => result.id)).toEqual(["t-haifa"]);
  });

  it('q="" + city=חיפה → filter-only search runs and city is a hard filter', async () => {
    const out = await run("", { city: "חיפה" });
    expect(out.plan.hardFilters.cityNames).toEqual(["חיפה"]);
    expect(out.plan.explicitFilters?.cityNames).toEqual(["חיפה"]);
    expect(out.emptyReason).toBeNull();
    expect(out.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it('q="" + population=children → population reaches hardFilters and filters results', async () => {
    const out = await run("", { population: "children" });
    expect(out.plan.hardFilters.populationSlugs).toEqual(["children"]);
    expect(out.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it('q="" + language=ru → language reaches hardFilters and filters results', async () => {
    const out = await run("", { language: "ru" });
    expect(out.plan.hardFilters.languageCodes).toEqual(["ru"]);
    expect(out.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it('q="פסיכולוג" + explicit city=חיפה → profession from query AND city from UI', async () => {
    const out = await run("פסיכולוג", { city: "חיפה" });
    expect(out.plan.hardFilters.professionSlugs).toEqual(["psychologist"]);
    expect(out.plan.hardFilters.cityNames).toEqual(["חיפה"]);
    expect(out.plan.filterConflicts).toEqual([]);
    expect(out.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it('q="פסיכולוג בתל אביב" + explicit city=חיפה → explicit wins, values are NOT OR-ed', async () => {
    const out = await run("פסיכולוג בתל אביב", { city: "חיפה" });
    expect(out.plan.interpretation.hardFilters.cityNames).toEqual(["תל אביב"]);
    expect(out.plan.hardFilters.cityNames).toEqual(["חיפה"]);
    expect(out.plan.hardFilters.cityNames).not.toContain("תל אביב");
    expect(out.plan.filterConflicts).toEqual([{ category: "city", inferred: ["תל אביב"], explicit: ["חיפה"] }]);
    expect(out.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it("invalid explicit values are rejected and never enter the plan", async () => {
    const out = await run("", { city: "עיר-שלא-קיימת", population: "aliens", language: "zz" });
    expect(out.plan.hardFilters.cityNames).toEqual([]);
    expect(out.plan.hardFilters.populationSlugs).toEqual([]);
    expect(out.plan.hardFilters.languageCodes).toEqual([]);
    expect(out.plan.explicitFilters?.rejected.map((r) => r.category).sort()).toEqual([
      "city",
      "language",
      "population",
    ]);
    // Nothing to anchor the search on → unrecognized, not a silent full list.
    expect(out.emptyReason).toBe("unrecognized_query");
    expect(out.results).toEqual([]);
  });

  it("explicit city is canonicalized from an alias before entering the plan", async () => {
    const out = await run("", { city: 'ת"א' });
    expect(out.plan.hardFilters.cityNames).toEqual(["תל אביב"]);
    expect(out.results.map((r) => r.id)).toEqual(["t-telaviv"]);
  });

  it("eligibility still applies to filter-only searches (draft profile excluded)", async () => {
    const out = await run("", { city: "חיפה" });
    expect(out.results.map((r) => r.id)).not.toContain("t-hidden");
  });

  it("explicit filter with no matching therapist reports no_matching_therapists", async () => {
    const out = await run("", { city: "חיפה", language: "he" });
    expect(out.results).toEqual([]);
    expect(out.emptyReason).toBe("no_matching_therapists");
  });
});
