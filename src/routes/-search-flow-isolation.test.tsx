/**
 * Orchestration regression: in production the search page resolves to the
 * Unified flow and mounts ONLY `UnifiedSearchResults`. The Legacy and
 * structured server functions must never be invoked — even when the Legacy
 * implementation throws.
 *
 * The real route module is rendered (via the exported `SearchResultsSwitch`
 * used by `SearchPage`); only the specific dependencies needed by this test
 * are spied. No process-wide `mock.module()` overrides are used.
 */

import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";

import * as TherapistsFunctions from "@/lib/therapists.functions";
import * as StructuredSearchFunctions from "@/lib/structured-search.functions";
import * as QueryInterpreterFunctions from "@/lib/query-interpreter.functions";
import * as TherapistCardModule from "@/components/therapist-card";

const calls: string[] = [];

const listFilterOptionsSpy = spyOn(TherapistsFunctions, "listFilterOptions").mockImplementation((() => {
  calls.push("listFilterOptions");
  return Promise.resolve({ cities: [], populations: [], languages: [] });
}) as typeof TherapistsFunctions.listFilterOptions);

const classifyAndSearchSpy = spyOn(TherapistsFunctions, "classifyAndSearch").mockImplementation((() => {
  calls.push("classifyAndSearch");
  throw new Error("legacy classifyAndSearch must not run in production mode");
}) as typeof TherapistsFunctions.classifyAndSearch);

const searchStructuredTherapistsSpy = spyOn(StructuredSearchFunctions, "searchStructuredTherapists").mockImplementation(
  (() => {
    calls.push("searchStructuredTherapists");
    throw new Error("structured search must not run in production mode");
  }) as typeof StructuredSearchFunctions.searchStructuredTherapists,
);

// The card renders TanStack <Link>, which needs a RouterProvider. Rendering
// the real card is not the subject here, so replace only this export with a
// restorable spy while keeping the rest of the module real.
const therapistCardSpy = spyOn(TherapistCardModule, "TherapistCard").mockImplementation((({
  t,
}: {
  t: { full_name: string };
}) => <div>{t.full_name}</div>) as typeof TherapistCardModule.TherapistCard);

const unifiedSearchSpy = spyOn(QueryInterpreterFunctions, "unifiedSearch").mockImplementation((() => {
  calls.push("unifiedSearch");
  return Promise.resolve({
    plan: null,
    results: [
      {
        id: "t-haifa",
        slug: "t-haifa",
        full_name: "יעל כהן",
        professional_title: "פסיכולוגית",
        image_url: null,
        verified: true,
        years_experience: 10,
        short_intro: null,
        primary_clinic: null,
        clinic_locations: [],
        additional_clinic_count: 0,
        online_available: false,
        gender: null,
        accessible_clinic: false,
        home_visit_regions: [],
        language_names: [],
        population_names: [],
        population_tags: [],
        modality_names: [],
        treatment_domains: [],
        lgbtq_affirming: false,
        offers_free_intro: false,
        scores: { semantic: 0, preference: 0, quality: 5 },
      },
    ],
    emptyReason: null,
    primaryClinicFallbackCount: 0,
  });
}) as typeof QueryInterpreterFunctions.unifiedSearch);

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { renderToStaticMarkup } = await import("react-dom/server");
const { SearchResultsSwitch, resolveFlow, unifiedResultsQuery, structuredTherapistQuery, toUnifiedParams } =
  await import("./search");

const search = {
  q: "פסיכולוג",
  problem: "",
  city: "חיפה",
  population: "",
  language: "",
  flow: "legacy",
};

afterEach(() => {
  calls.length = 0;
});

afterAll(() => {
  unifiedSearchSpy.mockRestore();
  therapistCardSpy.mockRestore();
  searchStructuredTherapistsSpy.mockRestore();
  classifyAndSearchSpy.mockRestore();
  listFilterOptionsSpy.mockRestore();
});

async function renderUnified() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Prefetch exactly what the route loader prefetches for the unified flow.
  await qc.ensureQueryData(unifiedResultsQuery(toUnifiedParams(search)));
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <SearchResultsSwitch flow="unified" search={search} />
    </QueryClientProvider>,
  );
  return { html, qc };
}

describe("search flow isolation", () => {
  it("production resolves to unified even when the URL asks for legacy", () => {
    expect(resolveFlow(search.flow, { isDev: false })).toBe("unified");
  });

  it("legacy remains reachable only in DEV", () => {
    expect(resolveFlow("legacy", { isDev: true })).toBe("legacy");
    expect(resolveFlow("legacy", { isDev: false })).toBe("unified");
  });

  it("Preview defaults to unified unless legacy is requested explicitly", () => {
    expect(resolveFlow("", { isDev: true })).toBe("unified");
    expect(resolveFlow("unified", { isDev: true })).toBe("unified");
    expect(resolveFlow("unexpected", { isDev: true })).toBe("unified");
  });

  it("unified mode mounts only UnifiedSearchResults and calls only unifiedSearch", async () => {
    const { html } = await renderUnified();
    expect(html).toContain("יעל כהן");
    expect(calls).toEqual(["unifiedSearch"]);
    expect(calls).not.toContain("classifyAndSearch");
    expect(calls).not.toContain("searchStructuredTherapists");
    // The legacy "התאמות לפי שם" section is never rendered.
    expect(html).not.toContain("התאמות לפי שם");
  });

  it("a throwing Legacy implementation cannot affect unified mode", async () => {
    // classifyAndSearch / searchStructuredTherapists throw synchronously
    // (see the spies above); unified rendering still succeeds.
    const { html } = await renderUnified();
    expect(html).not.toContain("תוצאות עבור");
    expect(html).toContain("מטפלים מתאימים");
    expect(html).toContain("מטפל אחד");
  });

  it("the legacy query caches are never populated in unified mode", async () => {
    const { qc } = await renderUnified();
    const keys = qc
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys.some((k) => k.includes("unified-search"))).toBe(true);
    expect(keys.some((k) => k.includes("structured-search"))).toBe(false);
    expect(keys.some((k) => k.startsWith('["search"'))).toBe(false);
    // Sanity: the structured query key exists as an option object but was
    // never fetched.
    expect(structuredTherapistQuery(search.q).queryKey[0]).toBe("structured-search");
  });
});
