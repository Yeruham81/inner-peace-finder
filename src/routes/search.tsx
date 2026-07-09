import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  listFilterOptions,
  classifyAndSearch,
} from "@/lib/therapists.functions";
import { searchTherapistEntities } from "@/lib/entity-search.functions";
import { TherapistCard } from "@/components/therapist-card";
import { SearchForm } from "@/components/search-form";
import { track } from "@/lib/analytics";

const searchSchema = z.object({
  q: fallback(z.string().trim().max(200), "").default(""),
  problem: fallback(z.string().trim().max(80), "").default(""),
  city: fallback(z.string().trim().max(80), "").default(""),
  population: fallback(z.string().trim().max(40), "").default(""),
  language: fallback(z.string().trim().max(8), "").default(""),
});

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

function entityQuery(q: string) {
  return queryOptions({
    queryKey: ["entity-search", q],
    queryFn: () =>
      q.trim().length >= 2
        ? searchTherapistEntities({ data: { query: q.trim(), limit: 4 } })
        : Promise.resolve([]),
  });
}

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(filterOptionsQuery),
      context.queryClient.ensureQueryData(resultsQuery(deps)),
      context.queryClient.ensureQueryData(entityQuery(deps.q)),
    ]);
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
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);
  const { data: pipeline } = useSuspenseQuery(resultsQuery(search));
  const { data: entityMatches } = useSuspenseQuery(entityQuery(search.q));
  const isClarification = pipeline.mode === "clarification";
  const results = isClarification ? [] : pipeline.therapists;

  const lastSearchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify({ ...search, mode: pipeline.mode, n: results.length });
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
  }, [search.q, search.problem, search.city, search.population, search.language, results.length, pipeline.mode]);

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

      {entityMatches && entityMatches.length > 0 && (
        <section
          aria-label="התאמות לפי שם"
          className="mt-4 rounded-2xl border border-border bg-surface p-4"
        >
          <p className="text-sm font-semibold text-foreground">התאמות לפי שם או מקצוע</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {entityMatches.map((m) => (
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

      {isClarification ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface-elevated p-6 shadow-soft">
          <p className="text-base font-semibold text-foreground">
            {pipeline.clarification.question}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pipeline.clarification.reason === "disambiguation"
              ? "מצאנו כמה כיוונים קרובים. בחרו את המתאים ביותר כדי שנציג מטפלים רלוונטיים."
              : "לא הצלחנו לזהות בוודאות את הנושא. בחרו את ההגדרה המתאימה ביותר כדי שנציג מטפלים רלוונטיים."}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {pipeline.clarification.options.map((opt) => (
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