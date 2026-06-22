import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  listFilterOptions,
  searchTherapists,
} from "@/lib/therapists.functions";
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
      searchTherapists({
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

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(filterOptionsQuery),
      context.queryClient.ensureQueryData(resultsQuery(deps)),
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
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);
  const { data: results } = useSuspenseQuery(resultsQuery(search));

  useEffect(() => {
    track("search_executed", { page_source: "search" });
    if (results.length === 0) {
      track("no_results_returned", { page_source: "search" });
    } else {
      track("therapist_results_rendered", {
        page_source: "search",
        rank_position: results.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q, search.problem, search.city, search.population, search.language, results.length]);

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
        <span className="text-sm text-muted-foreground">
          <span className="ltr-num">{results.length}</span> מטפלים
        </span>
      </div>

      {results.length === 0 ? (
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
          {results.map((t) => (
            <TherapistCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}