import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  listFilterOptions,
  classifyAndSearch,
  type ScoredTherapist,
} from "@/lib/therapists.functions";
import { searchStructuredTherapists } from "@/lib/structured-search.functions";
import { unifiedSearch, type UnifiedSearchResult } from "@/lib/query-interpreter.functions";
import { TherapistCard } from "@/components/therapist-card";
import { SearchForm } from "@/components/search-form";
import { track } from "@/lib/analytics";

/**
 * Search-flow switch.
 *
 * Production: ALWAYS "unified". The `?flow=` URL parameter is ignored in
 * production builds — legacy is not a supported production surface, and
 * there is no silent fallback from unified to legacy.
 *
 * Development: `?flow=legacy|unified` is honored for side-by-side
 * comparison. When the parameter is missing or invalid, DEV defaults to
 * "legacy" (the pre-Q1 baseline) so the parameter is the ONLY way to
 * opt into unified locally.
 */
export const FLOW_VALUES = ["legacy", "unified"] as const;
export type FlowValue = (typeof FLOW_VALUES)[number];

const searchSchema = z.object({
  q: fallback(z.string().trim().max(200), "").default(""),
  problem: fallback(z.string().trim().max(80), "").default(""),
  city: fallback(z.string().trim().max(80), "").default(""),
  population: fallback(z.string().trim().max(40), "").default(""),
  language: fallback(z.string().trim().max(8), "").default(""),
  flow: fallback(z.string(), "legacy").default("legacy"),
});

export function resolveFlow(raw: string, opts: { isDev: boolean }): FlowValue {
  if (!opts.isDev) return "unified";
  return (FLOW_VALUES as readonly string[]).includes(raw) ? (raw as FlowValue) : "legacy";
}

function resolveFlowFromEnv(raw: string): FlowValue {
  return resolveFlow(raw, { isDev: import.meta.env.DEV });
}

const filterOptionsQuery = queryOptions({
  queryKey: ["filter-options"],
  queryFn: () => listFilterOptions(),
});

function resultsQuery(params: z.infer<typeof searchSchema>) {
  return queryOptions({
    queryKey: ["search", params],
    queryFn: () =>
      classifyAndSearch({
        data: {
          query: params.q || null,
          problemSlug: params.problem || null,
          city: params.city || null,
          populationSlug: params.population || null,
          languageCode: params.language || null,
        },
      }),
  });
}

function unifiedResultsQuery(q: string) {
  return queryOptions({
    queryKey: ["unified-search", q],
    queryFn: (): Promise<UnifiedSearchResult | null> =>
      q.trim().length >= 1
        ? unifiedSearch({ data: { query: q.trim(), limit: 20 } })
        : Promise.resolve(null),
  });
}

function structuredTherapistQuery(q: string) {
  return queryOptions({
    queryKey: ["structured-search", "therapist", q],
    queryFn: () =>
      q.trim().length >= 2
        ? searchStructuredTherapists({ data: { query: q.trim(), limit: 4 } })
        : Promise.resolve([]),
  });
}

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const flow = resolveFlow(deps.flow);
    const promises: Promise<unknown>[] = [
      context.queryClient.ensureQueryData(filterOptionsQuery),
    ];
    if (flow === "unified") {
      promises.push(context.queryClient.ensureQueryData(unifiedResultsQuery(deps.q)));
    } else {
      promises.push(context.queryClient.ensureQueryData(structuredTherapistQuery(deps.q)));
      promises.push(context.queryClient.ensureQueryData(resultsQuery(deps)));
    }
    await Promise.all(promises);
  },
  head: () => ({
    meta: [
      { title: "חיפוש מטפלים לחרדה" },
      {
        name: "description",
        content: "תוצאות חיפוש מטפלים לחרדה לפי בעיה, עיר, אוכלוסייה ושפה.",
      },
    ],
  }),
  component: SearchPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6 text-center">
      <h1 className="text-xl font-semibold">החיפוש נכשל</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">לא נמצא</div>,
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const flow = resolveFlow(search.flow);
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);
  const { data: structuredMatches } = useSuspenseQuery({
    ...structuredTherapistQuery(search.q),
    // Structured therapist pills are a LEGACY-only surface. In unified
    // mode the displayed therapist list must come exclusively from
    // `executeUnifiedSearch` — never merged, appended, or supplemented
    // by the parallel structured path.
    enabled: flow === "legacy",
  } as ReturnType<typeof structuredTherapistQuery>);
  const { data: legacyPipeline } = useSuspenseQuery({
    ...resultsQuery(search),
    enabled: flow === "legacy",
  } as ReturnType<typeof resultsQuery>);
  const { data: unifiedPipeline } = useSuspenseQuery({
    ...unifiedResultsQuery(search.q),
    enabled: flow === "unified",
  } as ReturnType<typeof unifiedResultsQuery>);

  const isClarification =
    flow === "legacy" && legacyPipeline?.mode === "clarification";
  const legacyResults =
    legacyPipeline && legacyPipeline.mode !== "clarification"
      ? legacyPipeline.therapists
      : [];
  const results: ScoredTherapist[] =
    flow === "unified"
      ? (unifiedPipeline?.results ?? []).map((r) => ({
          id: r.id,
          slug: r.slug,
          full_name: r.full_name,
          professional_title: r.professional_title,
          short_intro: null,
          years_experience: r.yearsExperience,
          city: r.city,
          image_url: r.image_url,
          verified: r.verified,
          score: r.semanticScore,
          matched_problem_slugs: [],
          population_names: [],
          language_names: [],
        }))
      : legacyResults;
  const pipelineMode: string =
    flow === "unified" ? "unified" : (legacyPipeline?.mode ?? "results");

  const lastSearchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify({ ...search, mode: pipelineMode, n: results.length });
    if (lastSearchKeyRef.current === key) return;
    lastSearchKeyRef.current = key;
    track("search_executed", { page_source: "search", origin: "SearchPage" });
    if (isClarification) {
      track("search_clarification_shown", { page_source: "search", origin: "SearchPage" });
    } else if (results.length === 0) {
      track("no_results_returned", { page_source: "search", origin: "SearchPage" });
    } else {
      track("therapist_results_rendered", {
        page_source: "search",
        rank_position: results.length,
        origin: "SearchPage",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q, search.problem, search.city, search.population, search.language, results.length, pipelineMode]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <SearchForm
        initialQuery={search.q}
        cities={filters.cities}
        populations={filters.populations}
        languages={filters.languages}
        initialFilters={{
          city: search.city,
          population: search.population,
          language: search.language,
        }}
        variant="compact"
      />

      <div className="mt-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {search.q ? (
            <>
              תוצאות עבור <span className="text-primary">"{search.q}"</span>
            </>
          ) : (
            "כל המטפלים"
          )}
        </h1>
        {!isClarification && (
          <span className="text-sm text-muted-foreground">
            <span className="ltr-num">{results.length}</span> מטפלים
          </span>
        )}
      </div>

      {flow === "legacy" && structuredMatches && structuredMatches.length > 0 && (
        <section
          aria-label="התאמות לפי שם"
          className="mt-4 rounded-2xl border border-border bg-surface p-4"
        >
          <p className="text-sm font-semibold text-foreground">התאמות לפי שם או מקצוע</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {structuredMatches.map((m) => (
              <li key={m.id}>
                <Link
                  to="/therapists/$slug"
                  params={{ slug: m.slug }}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-brand hover:bg-brand/5"
                >
                  <span className="font-medium">{m.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.professional_title}{m.city ? ` · ${m.city}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {import.meta.env.DEV && (
        <div className="mt-4 rounded-md border border-dashed border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono">flow={flow}</span>
          <span className="mx-2">·</span>
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={() =>
              navigate({
                to: "/search",
                search: { ...search, flow: flow === "unified" ? "legacy" : "unified" },
              })
            }
          >
            switch to {flow === "unified" ? "legacy" : "unified"}
          </button>
        </div>
      )}

      {isClarification ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface-elevated p-6 shadow-soft">
          <p className="text-base font-semibold text-foreground">
            {legacyPipeline!.clarification.question}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {legacyPipeline!.clarification.reason === "disambiguation"
              ? "מצאנו כמה כיוונים קרובים. בחרו את המתאים ביותר כדי שנציג מטפלים רלוונטיים."
              : "לא הצלחנו לזהות בוודאות את הנושא. בחרו את ההגדרה המתאימה ביותר כדי שנציג מטפלים רלוונטיים."}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {legacyPipeline!.clarification.options.map((opt) => (
              <button
                key={opt.slug}
                type="button"
                onClick={() => {
                  track("search_clarification_chosen", {
                    page_source: "search",
                    problem_slug: opt.slug,
                  });
                  navigate({
                    to: "/search",
                    search: { ...search, problem: opt.slug },
                  });
                }}
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand hover:bg-brand/5"
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <p className="text-base text-muted-foreground">
            לא נמצאו מטפלים התואמים לחיפוש. נסו לנסח אחרת או להסיר סינונים.
          </p>
          <Link
            to="/search"
            search={{}}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            איפוס חיפוש
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {results.map((t, i) => (
            <TherapistCard key={t.id} t={t} rankPosition={i + 1} pageSource="search" />
          ))}
        </div>
      )}
    </div>
  );
}