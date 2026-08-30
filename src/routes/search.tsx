import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { listFilterOptions } from "@/lib/therapists.functions";
import { unifiedSearch, type UnifiedSearchResult } from "@/lib/query-interpreter.functions";
import type { SearchCriterion } from "@/lib/query-interpreter.types";
import type { SearchResultCard } from "@/lib/search-result-card";
import { hasAnyExplicitFilter, resolveSearchContract, type ExplicitSearchContract } from "@/lib/search-contract";
import { readPrivateSearchQuery } from "@/lib/private-search-query";
import { TherapistCard } from "@/components/therapist-card";
import { SearchForm } from "@/components/search-form";
import { PublicRouteError } from "@/components/public-route-error";
import { track } from "@/lib/analytics";

const searchSchema = z.object({
  searchId: fallback(z.string().regex(/^[a-f0-9]{32}$/), "").default(""),
  problem: fallback(z.string().trim().max(80), "").default(""),
  city: fallback(z.string().trim().max(80), "").default(""),
  population: fallback(z.string().trim().max(40), "").default(""),
  /** Legacy single-language URL param; canonical navigation writes `languages`. */
  language: fallback(z.string().trim().max(8), "").default(""),
  languages: fallback(z.union([z.string().trim().max(80), z.array(z.string().trim().max(8)).max(8)]), "").default(""),
  regions: fallback(z.union([z.string(), z.array(z.string())]), "").default(""),
  serviceTypes: fallback(z.union([z.string(), z.array(z.string())]), "").default(""),
  professions: fallback(z.union([z.string(), z.array(z.string())]), "").default(""),
  modalities: fallback(z.union([z.string(), z.array(z.string())]), "").default(""),
  therapyFormats: fallback(z.union([z.string(), z.array(z.string())]), "").default(""),
  gender: fallback(z.string(), "").default(""),
  accessible: fallback(z.string(), "").default(""),
  verified: fallback(z.string(), "").default(""),
  lgbtqAffirming: fallback(z.string(), "").default(""),
  freeIntro: fallback(z.string(), "").default(""),
  excludedCriteria: fallback(z.union([z.string(), z.array(z.string())]), "").default(""),
});

const filterOptionsQuery = queryOptions({
  queryKey: ["filter-options"],
  queryFn: () => listFilterOptions(),
});

export type UnifiedParams = ExplicitSearchContract;

/**
 * The unified search ALWAYS runs — including with no input at all. An empty
 * request is a legitimate "browse every eligible therapist" search, so the
 * page never renders an empty state that contradicts a populated list.
 */
export function unifiedResultsQuery(p: UnifiedParams) {
  return queryOptions({
    queryKey: ["unified-search", p],
    queryFn: (): Promise<UnifiedSearchResult> =>
      unifiedSearch({
        data: {
          query: p.q,
          problems: [...p.problemSlugs],
          city: p.city,
          population: p.population,
          languages: [...p.languages],
          regions: [...p.regions],
          serviceTypes: [...p.serviceTypes],
          professions: [...p.professionSlugs],
          modalities: [...p.modalitySlugs],
          therapyFormats: [...p.therapyFormats],
          gender: p.gender || undefined,
          accessible: p.accessible,
          verified: p.verified,
          lgbtqAffirming: p.lgbtqAffirming,
          freeIntro: p.freeIntro,
          excludedCriteria: [...(p.excludedCriteria ?? [])],
          limit: 20,
        },
      }),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export const Route = createFileRoute("/search")({
  // The loader needs sessionStorage to recover the private free-text query.
  // /search is already noindex, so disabling SSR here does not sacrifice an
  // indexable landing page.
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const privateQuery = deps.searchId ? readPrivateSearchQuery(deps.searchId) : "";
    const promises: Promise<unknown>[] = [context.queryClient.ensureQueryData(filterOptionsQuery)];

    // If a URL containing only an opaque searchId is opened in another tab or
    // device, the private query is deliberately unavailable. Do not silently
    // turn that request into a broad search.
    if (privateQuery !== null) {
      promises.push(context.queryClient.ensureQueryData(unifiedResultsQuery(toUnifiedParams(deps, privateQuery))));
    }

    await Promise.all(promises);
  },
  head: () => ({
    meta: [
      { title: "חיפוש מטפלים | Tipulinks" },
      {
        name: "description",
        content: "חיפוש מטפלים לפי צורך, אזור, יישוב, אוכלוסיית יעד, שפה ואופן הטיפול.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: SearchPage,
  errorComponent: ({ error, reset }) => (
    <PublicRouteError
      error={error}
      reset={reset}
      boundary="search_route"
      title="לא הצלחנו להשלים את החיפוש"
      message="אירעה שגיאה זמנית בטעינת תוצאות החיפוש. נסו שוב בעוד רגע או חזרו לדף הבית."
    />
  ),
  notFoundComponent: () => <div className="p-6">לא נמצא</div>,
});

type SearchParams = z.infer<typeof searchSchema>;

export function toUnifiedParams(s: SearchParams, privateQuery = ""): UnifiedParams {
  return resolveSearchContract({
    q: privateQuery,
    problem: s.problem,
    city: s.city,
    population: s.population,
    language: s.language,
    languages: s.languages,
    regions: s.regions,
    serviceTypes: s.serviceTypes,
    professions: s.professions,
    modalities: s.modalities,
    therapyFormats: s.therapyFormats,
    gender: s.gender,
    accessible: s.accessible,
    verified: s.verified,
    lgbtqAffirming: s.lgbtqAffirming,
    freeIntro: s.freeIntro,
    excludedCriteria: s.excludedCriteria,
  });
}

/**
 * Copy for the two distinct empty states the Unified executor reports.
 * They are NOT interchangeable: one means "we could not understand the
 * request", the other means "we understood it and nobody matched".
 */
export function emptyStateMessage(reason: null | "unrecognized_query" | "no_matching_therapists"): {
  title: string;
  body: string;
} {
  if (reason === "unrecognized_query") {
    return {
      title: "לא הצלחנו להבין את הבקשה",
      body: "לא זיהינו בוודאות מה חיפשתם. נסו לנסח מחדש במילים אחרות, או בחרו אזור, יישוב, אוכלוסיית יעד, שפה או אופן טיפול.",
    };
  }
  return {
    title: "לא נמצאו מטפלים מתאימים",
    body: "הבנו את הבקשה, אך אין כרגע מטפלים גלויים שעונים על כל הקריטריונים. נסו להסיר סינון אחד או יותר.",
  };
}

function useSearchAnalytics(args: { search: SearchParams; mode: string; count: number; isSafetyTriage?: boolean }) {
  const { search, mode, count, isSafetyTriage = false } = args;
  const lastSearchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify({ ...search, mode, n: count });
    if (lastSearchKeyRef.current === key) return;
    lastSearchKeyRef.current = key;
    track("search_executed", { page_source: "search", origin: "SearchPage" });
    if (isSafetyTriage) {
      return;
    }
    if (count === 0) {
      track("no_results_returned", {
        page_source: "search",
        origin: "SearchPage",
      });
    } else {
      track("therapist_results_rendered", {
        page_source: "search",
        rank_position: count,
        origin: "SearchPage",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search.searchId,
    search.problem,
    search.city,
    search.population,
    search.language,
    search.languages,
    search.regions,
    search.serviceTypes,
    count,
    mode,
    isSafetyTriage,
  ]);
}

function resultCountLabel(count: number): string {
  if (count === 1) return "מטפל אחד";
  return `${count} מטפלים`;
}

function ResultsHeader({ count, hasFilters }: { count: number | null; hasFilters: boolean }) {
  return (
    <div className="mt-7 flex flex-wrap items-end justify-between gap-2 sm:mt-8">
      <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
        {hasFilters ? "מטפלים מתאימים" : "כל המטפלים"}
      </h1>
      {count !== null && (
        <span aria-live="polite" className="pb-0.5 text-sm text-muted-foreground sm:text-base">
          {resultCountLabel(count)}
        </span>
      )}
    </div>
  );
}

function ResultsGrid({ results }: { results: SearchResultCard[] }) {
  return (
    <section aria-label="תוצאות חיפוש" className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 sm:mt-6 sm:gap-5">
      {results.map((t, i) => (
        <TherapistCard key={t.id} t={t} rankPosition={i + 1} pageSource="search" />
      ))}
    </section>
  );
}

function EmptyState({ reason }: { reason: null | "unrecognized_query" | "no_matching_therapists" }) {
  const msg = emptyStateMessage(reason);
  return (
    <div
      data-testid="search-empty-state"
      data-empty-reason={reason ?? "no_matching_therapists"}
      className="mt-6 rounded-2xl border border-dashed border-border bg-surface px-5 py-10 text-center sm:px-10 sm:py-12"
    >
      <p className="text-lg font-semibold text-foreground">{msg.title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{msg.body}</p>
      <Link
        to="/search"
        search={{}}
        className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl border border-brand/30 bg-brand-soft px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-brand/50 hover:bg-brand-soft/80"
      >
        ניקוי החיפוש והצגת כל המטפלים
      </Link>
    </div>
  );
}

function UrgentHelpState() {
  return (
    <section
      data-testid="search-urgent-help"
      className="mt-6 rounded-2xl border border-brand/30 bg-brand-soft px-5 py-8 text-right sm:px-8 sm:py-10"
      aria-labelledby="urgent-help-title"
    >
      <h2 id="urgent-help-title" className="text-xl font-bold text-foreground sm:text-2xl">
        ייתכן שאתם זקוקים לעזרה מיידית
      </h2>

      <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/80 sm:text-base">
        טיפולינקס מסייע במציאת מטפלים ואינו מיועד למצבי חירום.
      </p>

      <p className="mt-5 max-w-3xl text-sm leading-7 text-foreground sm:text-base">
        <strong>אם קיימת סכנה מיידית לך או לאדם אחר</strong>, יש לפנות מיד לשירותי החירום או להגיע לחדר המיון הקרוב.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href="tel:101"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          מד״א — 101
        </a>

        <a
          href="tel:100"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground"
        >
          משטרת ישראל — 100
        </a>
      </div>

      <p className="mt-6 max-w-3xl text-sm leading-7 text-foreground sm:text-base">
        <strong>במקרה של מצוקה נפשית חריפה או מחשבות על פגיעה עצמית</strong>, מומלץ לא להישאר לבד ולפנות בהקדם לאדם קרוב
        או לגורם מקצועי מתאים.
      </p>

      <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/80 sm:text-base">
        ניתן לפנות גם לער״ן – עזרה ראשונה נפשית בטלפון <strong>1201</strong>.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href="tel:1201"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground"
        >
          ער״ן — 1201
        </a>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Unified flow (the ONLY production surface)                          */
/* ------------------------------------------------------------------ */

export function availableQuickFilters(results: SearchResultCard[]): string[] {
  const available = new Set<string>();
  for (const result of results) {
    if (result.clinic_locations.length > 0) available.add("clinic");
    if (result.online_available) available.add("online");
    if (result.home_visit_regions.length > 0) available.add("home_visit");
    if (result.gender) available.add(result.gender);
    if (result.accessible_clinic) available.add("accessible");
    if (result.verified) available.add("verified");
    if (result.lgbtq_affirming) available.add("lgbtqAffirming");
    if (result.offers_free_intro) available.add("freeIntro");
  }
  return [...available].sort();
}

function UnifiedSearchResults({
  search,
  contract,
  onQuickFiltersChange,
  onInferredCriteriaChange,
}: {
  search: SearchParams;
  contract: UnifiedParams;
  onQuickFiltersChange?: (filters: string[]) => void;
  onInferredCriteriaChange?: (criteria: SearchCriterion[]) => void;
}) {
  const { data: pipeline } = useSuspenseQuery(unifiedResultsQuery(contract));
  // No adaptation: the unified pipeline already returns the card contract.
  const results: SearchResultCard[] = pipeline?.results ?? [];
  const quickFilterKey = availableQuickFilters(results).join(",");
  const criteria = pipeline?.plan?.criteria ?? [];
  const criteriaKey = criteria.map((criterion) => `${criterion.type}:${criterion.value}:${criterion.label}`).join("|");
  useEffect(() => {
    onQuickFiltersChange?.(quickFilterKey ? quickFilterKey.split(",") : []);
  }, [onQuickFiltersChange, quickFilterKey]);
  useEffect(() => {
    onInferredCriteriaChange?.(criteria);
  }, [onInferredCriteriaChange, criteriaKey]);
  const emptyReason = pipeline?.emptyReason ?? null;
  const isSafetyTriage = emptyReason === "urgent_help";
  useSearchAnalytics({
    search,
    mode: isSafetyTriage ? "urgent_help" : "unified",
    count: results.length,
    isSafetyTriage,
  });

  if (isSafetyTriage) return <UrgentHelpState />;
  const nonUrgentEmptyReason = emptyReason === "unrecognized_query" ? "unrecognized_query" : "no_matching_therapists";

  return (
    <>
      <ResultsHeader
        count={results.length}
        hasFilters={!pipeline?.plan?.browseAll && (Boolean(contract.q) || hasAnyExplicitFilter(contract))}
      />
      {results.length === 0 ? <EmptyState reason={nonUrgentEmptyReason} /> : <ResultsGrid results={results} />}
    </>
  );
}

function PrivateSearchUnavailableState() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface px-5 py-10 text-center sm:px-10 sm:py-12">
      <p className="text-lg font-semibold text-foreground">החיפוש החופשי אינו זמין בלשונית הזו</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        מטעמי פרטיות, תוכן החיפוש החופשי אינו נשמר בקישור. הזינו מחדש את הבקשה בשדה החיפוש כדי לקבל תוצאות.
      </p>
    </div>
  );
}

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);
  const privateQuery = search.searchId ? readPrivateSearchQuery(search.searchId) : "";
  const queryUnavailable = Boolean(search.searchId) && privateQuery === null;
  const contract = toUnifiedParams(search, privateQuery ?? "");
  const [quickFilters, setQuickFilters] = useState<string[] | undefined>(undefined);
  const [inferredCriteria, setInferredCriteria] = useState<SearchCriterion[]>([]);

  // Old bookmarks may still contain the retired raw `q` parameter (or the old
  // `flow` switch). They are ignored by the schema and removed from the visible
  // URL without ever being processed as a search query.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("q") && !url.searchParams.has("flow")) return;
    url.searchParams.delete("q");
    url.searchParams.delete("flow");
    void navigate({ href: `${url.pathname}${url.search}${url.hash}`, replace: true });
  }, [navigate]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <SearchForm
        initialQuery={contract.q}
        cities={filters.cities}
        cityRegions={filters.cityRegions}
        populations={filters.populations}
        languages={filters.languages}
        professions={filters.professions}
        modalities={filters.modalities}
        therapyFormats={filters.therapyFormats}
        initialFilters={{
          city: contract.city,
          population: contract.population,
          languages: [...contract.languages],
          regions: [...contract.regions],
          serviceTypes: [...contract.serviceTypes],
          professions: [...contract.professionSlugs],
          modalities: [...contract.modalitySlugs],
          therapyFormats: [...contract.therapyFormats],
          gender: contract.gender,
          accessible: contract.accessible,
          verified: contract.verified,
          lgbtqAffirming: contract.lgbtqAffirming,
          freeIntro: contract.freeIntro,
          excludedCriteria: [...(contract.excludedCriteria ?? [])],
        }}
        preserveSearch={{
          problem: search.problem,
          searchId: search.searchId || undefined,
        }}
        inferredCriteria={queryUnavailable ? [] : inferredCriteria}
        variant="compact"
        availableQuickFilters={queryUnavailable ? undefined : quickFilters}
      />

      {queryUnavailable ? (
        <PrivateSearchUnavailableState />
      ) : (
        <UnifiedSearchResults
          search={search}
          contract={contract}
          onQuickFiltersChange={setQuickFilters}
          onInferredCriteriaChange={setInferredCriteria}
        />
      )}
    </div>
  );
}
