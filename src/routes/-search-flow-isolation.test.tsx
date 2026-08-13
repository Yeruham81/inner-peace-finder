/**
 * Orchestration regression: in production the search page resolves to the
 * Unified flow and mounts ONLY `UnifiedSearchResults`. The Legacy and
 * structured server functions must never be invoked — even when the Legacy
 * implementation throws.
 *
 * The real route module is rendered (via the exported `SearchResultsSwitch`
 * used by `SearchPage`); only the server-function modules are doubled.
 */

import { afterEach, describe, expect, it, mock } from "bun:test";

const calls: string[] = [];

mock.module("@/lib/therapists.functions", () => ({
  listFilterOptions: () => {
    calls.push("listFilterOptions");
    return Promise.resolve({ cities: [], populations: [], languages: [] });
  },
  classifyAndSearch: () => {
    calls.push("classifyAndSearch");
    throw new Error("legacy classifyAndSearch must not run in production mode");
  },
}));

mock.module("@/lib/structured-search.functions", () => ({
  searchStructuredTherapists: () => {
    calls.push("searchStructuredTherapists");
    throw new Error("structured search must not run in production mode");
  },
}));

// The card renders TanStack <Link>, which needs a RouterProvider. Rendering
// is not the subject here — query orchestration is — so the card is stubbed
// to a plain node while every query path stays real.
mock.module("@/components/therapist-card", () => ({
  TherapistCard: ({ t }: { t: { full_name: string } }) => <div>{t.full_name}</div>,
}));

mock.module("@/lib/query-interpreter.functions", () => ({
  unifiedSearch: () => {
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
          city: "חיפה",
          verified: true,
          semanticScore: 0,
          preferenceScore: 0,
          qualityScore: 5,
          yearsExperience: 10,
        },
      ],
      emptyReason: null,
    });
  },
}));

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { renderToStaticMarkup } = await import("react-dom/server");
const {
  SearchResultsSwitch,
  resolveFlow,
  unifiedResultsQuery,
  structuredTherapistQuery,
  toUnifiedParams,
} = await import("./search");

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
    // (see the module doubles above); unified rendering still succeeds.
    const { html } = await renderUnified();
    expect(html).toContain("תוצאות עבור");
  });

  it("the legacy query caches are never populated in unified mode", async () => {
    const { qc } = await renderUnified();
    const keys = qc.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(keys.some((k) => k.includes("unified-search"))).toBe(true);
    expect(keys.some((k) => k.includes("structured-search"))).toBe(false);
    expect(keys.some((k) => k.startsWith('["search"'))).toBe(false);
    // Sanity: the structured query key exists as an option object but was
    // never fetched.
    expect(structuredTherapistQuery(search.q).queryKey[0]).toBe("structured-search");
  });
});
