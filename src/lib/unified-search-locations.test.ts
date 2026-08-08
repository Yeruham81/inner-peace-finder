/**
 * Region / service-type filter semantics and result-card hydration, driven
 * through the REAL `runUnifiedSearch` orchestrator against an in-memory
 * Supabase double — no hand-built plans.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runUnifiedSearch } from "./query-interpreter.functions";
import { __resetCatalogCache } from "./query-catalog";
import { createFakeSupabase } from "./test-support/fake-supabase";
import { searchFixture } from "./test-support/search-fixture";
import { matchesLocationAvailability } from "./unified-search-executor";
import { cardLocationLine } from "./search-result-card";

function run(
  query: string,
  explicit: {
    city?: string; population?: string; language?: string;
    regions?: string[]; serviceTypes?: string[];
  } = {},
) {
  return runUnifiedSearch(
    { query, explicit, limit: 20 },
    createFakeSupabase(searchFixture()) as unknown as SupabaseClient<Database>,
  );
}

beforeEach(() => __resetCatalogCache());

describe("correlated region + service-type semantics (pure)", () => {
  const rows = [
    { location_type: "clinic", region_slug: "north" },
    { location_type: "online", region_slug: null },
  ];

  it("clinic + north matches when a single row satisfies both", () => {
    expect(matchesLocationAvailability(rows, { regionSlugs: ["north"], serviceTypes: ["clinic"] })).toBe(true);
  });

  it("clinic + south does NOT match a northern clinic plus unrelated online row", () => {
    expect(matchesLocationAvailability(rows, { regionSlugs: ["south"], serviceTypes: ["clinic"] })).toBe(false);
  });

  it("online is location-independent: it matches even with a region selected", () => {
    expect(matchesLocationAvailability(rows, { regionSlugs: ["south"], serviceTypes: ["online"] })).toBe(true);
  });

  it("a region alone means physical availability in that region", () => {
    expect(matchesLocationAvailability(rows, { regionSlugs: ["north"], serviceTypes: [] })).toBe(true);
    expect(matchesLocationAvailability(rows, { regionSlugs: ["south"], serviceTypes: [] })).toBe(false);
  });

  it("an online-only therapist is not matched by a region-only filter", () => {
    const onlineOnly = [{ location_type: "online", region_slug: null }];
    expect(matchesLocationAvailability(onlineOnly, { regionSlugs: ["north"], serviceTypes: [] })).toBe(false);
  });

  it("service types OR within the category", () => {
    const homeOnly = [{ location_type: "home_visit", region_slug: "north" }];
    expect(
      matchesLocationAvailability(homeOnly, { regionSlugs: [], serviceTypes: ["clinic", "home_visit"] }),
    ).toBe(true);
  });

  it("no region and no service type is not a filter at all", () => {
    expect(matchesLocationAvailability([], { regionSlugs: [], serviceTypes: [] })).toBe(true);
  });
});

describe("region and service-type filters on the production path", () => {
  it("regions=haifa-krayot matches the therapist with a Haifa clinic", async () => {
    const out = await run("", { regions: ["haifa-krayot"] });
    expect(out.plan.hardFilters.regionSlugs).toEqual(["haifa-krayot"]);
    expect(out.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it("serviceTypes=online matches the online therapist only", async () => {
    const out = await run("", { serviceTypes: ["online"] });
    expect(out.results.map((r) => r.id)).toEqual(["t-telaviv"]);
  });

  it("region + service type must be satisfied by the SAME location row", async () => {
    // t-haifa does home visits in the north but has no northern CLINIC.
    const out = await run("", { regions: ["north"], serviceTypes: ["clinic"] });
    expect(out.results).toEqual([]);
    expect(out.emptyReason).toBe("no_matching_therapists");

    const homeVisits = await run("", { regions: ["north"], serviceTypes: ["home_visit"] });
    expect(homeVisits.results.map((r) => r.id)).toEqual(["t-haifa"]);
  });

  it("inactive location rows never satisfy a filter", async () => {
    // t-haifa's only southern clinic row is is_active=false.
    const out = await run("", { regions: ["south"] });
    expect(out.results).toEqual([]);
  });

  it("invalid regions and service types are rejected, not silently ignored", async () => {
    const out = await run("", { regions: ["atlantis"], serviceTypes: ["group"] });
    expect(out.plan.hardFilters.regionSlugs).toEqual([]);
    expect(out.plan.explicitFilters?.rejected.map((r) => r.category).sort()).toEqual([
      "region",
      "serviceType",
    ]);
    expect(out.emptyReason).toBe("unrecognized_query");
  });

  it("ineligible profiles are excluded from region filtering too", async () => {
    const out = await run("", { regions: ["haifa-krayot"] });
    expect(out.results.map((r) => r.id)).not.toContain("t-hidden");
  });
});

describe("result-card hydration comes from active locations, not therapists.city", () => {
  it("hydrates the primary clinic, extra clinic count, home visits and languages", async () => {
    const out = await run("", { regions: ["haifa-krayot"] });
    const card = out.results[0];
    expect(card.primary_clinic).toEqual({
      city: "חיפה", region_slug: "haifa-krayot", region_label: "חיפה והקריות",
    });
    expect(card.additional_clinic_count).toBe(1);
    expect(card.home_visit_regions).toEqual(["צפון"]);
    expect(card.online_available).toBe(false);
    expect(card.language_names).toEqual(["רוסית"]);
    expect(card.population_names).toEqual(["ילדים"]);
    expect(card.short_intro).toContain("יעל");
    expect(cardLocationLine(card)).toContain("חיפה");
  });

  it("never exposes contact details on a card", async () => {
    const out = await run("", { regions: ["haifa-krayot"] });
    const keys = Object.keys(out.results[0]);
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("contact_destination");
  });

  it("reports the primary-clinic display fallback when no clinic is marked primary", async () => {
    const out = await run("", { serviceTypes: ["online"] });
    expect(out.results[0].primary_clinic?.city).toBe("תל אביב");
    expect(out.primaryClinicFallbackCount).toBe(1);
  });
});

describe("/search with no input is internally consistent", () => {
  it("browses every eligible therapist instead of reporting an empty state", async () => {
    const out = await run("");
    expect(out.plan.browseAll).toBe(true);
    expect(out.emptyReason).toBeNull();
    expect(out.results.map((r) => r.id).sort()).toEqual(["t-haifa", "t-telaviv"]);
    expect(out.results.map((r) => r.id)).not.toContain("t-hidden");
  });

  it("browse mode is off as soon as any explicit filter is present", async () => {
    const out = await run("", { regions: ["haifa-krayot"] });
    expect(out.plan.browseAll).toBe(false);
  });
});