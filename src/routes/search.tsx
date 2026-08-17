import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  listFilterOptions,
  classifyAndSearch,
  type ScoredTherapist,
} from "@/lib/therapists.functions";
import { searchStructuredTherapists } from "@/lib/structured-search.functions";
import { unifiedSearch, type UnifiedSearchResult } from "@/lib/query-interpreter.functions";
import { legacyRowToCard, type SearchResultCard } from "@/lib/search-result-card";
import {
  hasAnyExplicitFilter,
  resolveSearchContract,
  type ExplicitSearchContract,
} from "@/lib/search-contract";
import { TherapistCard } from "@/components/therapist-card";
import { SearchForm } from "@/components/search-form";
import { PublicRouteError } from "@/components/public-route-error";
import { track } from "@/lib/analytics";
import { buildSearchReturn } from "@/lib/search-return";

/**
 * Search-flow switch.
 *
 * Production: ALWAYS "unified". The `?flow=` URL parameter is ignored in
 * production builds — legacy is not a supported production surface, and
 * there is no silent fallback from unified to legacy.
 *
 * Development: `?flow=legacy|unified` is honored for side-by-side
 * comparison. Missing or invalid values default to "unified" so Preview
 * exercises the same search pipeline as production. Legacy remains
 * reachable only through an explicit `?flow=legacy` diagnostic URL.
 */
export const FLOW_VALUES = ["legacy", "unified"] as const;
export type FlowValue = (typeof FLOW_VALUES)[number];

const searchSchema = z.object({
  q: fallback(z.string().trim().max(200), "").default(""),
  problem: fallback(z.string().trim().max(80), "").default(""),
  city: fallback(z.string().trim().max(80), "").default(""),
  population: fallback(z.string().trim().max(40), "").default(""),
  language: fallback(z.string().trim().max(8), "").default(""),
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
  flow: fallback(z.string(), "unified").default("unified"),
});

export function resolveFlow(raw: string, opts: { isDev: boolean }): FlowValue {
  if (!opts.isDev) return "unified";
  return raw === "legacy" ? "legacy" : "unified";
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
          language: p.language,
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
          limit: 20,
        },
      }),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function structuredTherapistQuery(q: string) {
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
    const flow = resolveFlowFromEnv(deps.flow);
    const promises: Promise<unknown>[] = [context.queryClient.ensureQueryData(filterOptionsQuery)];
    if (flow === "unified") {
      promises.push(
        context.queryClient.ensureQueryData(unifiedResultsQuery(toUnifiedParams(deps))),
      );
    } else {
      promises.push(context.queryClient.ensureQueryData(structuredTherapistQuery(deps.q)));
      promises.push(context.queryClient.ensureQueryData(resultsQuery(deps)));
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

export function toUnifiedParams(s: SearchParams): UnifiedParams {
  return resolveSearchContract({
    q: s.q,
    problem: s.problem,
    city: s.city,
    population: s.population,
    language: s.language,
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
  });
}

/**
 * Mounts EXACTLY ONE flow-specific results component. Exported so the
 * orchestration regression test can render the real switch and prove that
 * the Legacy queries are never instantiated in production (unified) mode.
 */
export function SearchResultsSwitch({
  flow,
  search,
  onQuickFiltersChange,
}: {
  flow: FlowValue;
  search: SearchParams;
  onQuickFiltersChange?: (filters: string[]) => void;
}) {
  return flow === "unified" ? (
    <UnifiedSearchResults search={search} onQuickFiltersChange={onQuickFiltersChange} />
  ) : (
    <LegacySearchResults search={search} />
  );
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

function useSearchAnalytics(args: {
  search: SearchParams;
  mode: string;
  count: number;
  isClarification: boolean;
  isSafetyTriage?: boolean;
}) {
  const { search, mode, count, isClarification, isSafetyTriage = false } = args;
  const lastSearchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify({ ...search, mode, n: count });
    if (lastSearchKeyRef.current === key) return;
    lastSearchKeyRef.current = key;
    track("search_executed", { page_source: "search", origin: "SearchPage" });
    if (isSafetyTriage) {
      return;
    }
    if (isClarification) {
      track("search_clarification_shown", {
        page_source: "search",
        origin: "SearchPage",
      });
    } else if (count === 0) {
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
    search.q,
    search.problem,
    search.city,
    search.population,
    search.language,
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

function ResultsHeader({
  q,
  count,
  hasFilters,
}: {
  q: string;
  count: number | null;
  hasFilters: boolean;
}) {
  return (
    <div className="mt-7 flex flex-wrap items-end justify-between gap-2 sm:mt-8">
      <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
        {q ? (
          <>
            תוצאות עבור <span className="text-primary">״{q}״</span>
          </>
        ) : hasFilters ? (
          "מטפלים לפי הסינון שבחרתם"
        ) : (
          "כל המטפלים"
        )}
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
    <section
      aria-label="תוצאות חיפוש"
      className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 sm:mt-6 sm:gap-5"
    >
      {results.map((t, i) => (
        <TherapistCard key={t.id} t={t} rankPosition={i + 1} pageSource="search" />
      ))}
    </section>
  );
}

function EmptyState({
  reason,
}: {
  reason: null | "unrecognized_query" | "no_matching_therapists";
}) {
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
        ייתכן שנדרשת עזרה מיידית
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/80 sm:text-base">
        טיפולינקס אינו שירות חירום. אם קיימת סכנה מיידית, מחשבה על פגיעה עצמית או מצב רפואי דחוף,
        מומלץ לפנות עכשיו לגורם סיוע מתאים ולא להסתמך על חיפוש מטפלים באתר.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href="tel:1201"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          ער״ן — 1201
        </a>
        <a
          href="tel:101"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground"
        >
          מגן דוד אדום — 101
        </a>
        <a
          href="tel:100"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground"
        >
          משטרת ישראל — 100
        </a>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground sm:text-sm">
        לאחר קבלת הסיוע המיידי, ניתן לחזור לחיפוש מטפל להמשך תמיכה וטיפול.
      </p>
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
  onQuickFiltersChange,
}: {
  search: SearchParams;
  onQuickFiltersChange?: (filters: string[]) => void;
}) {
  const contract = toUnifiedParams(search);
  const { data: pipeline } = useSuspenseQuery(unifiedResultsQuery(contract));
  // No adaptation: the unified pipeline already returns the card contract.
  const results: SearchResultCard[] = pipeline?.results ?? [];
  const quickFilterKey = availableQuickFilters(results).join(",");
  useEffect(() => {
    onQuickFiltersChange?.(quickFilterKey ? quickFilterKey.split(",") : []);
  }, [onQuickFiltersChange, quickFilterKey]);
  const emptyReason = pipeline?.emptyReason ?? null;
  const isSafetyTriage = emptyReason === "urgent_help";
  useSearchAnalytics({
    search,
    mode: isSafetyTriage ? "urgent_help" : "unified",
    count: results.length,
    isClarification: false,
    isSafetyTriage,
  });

  if (isSafetyTriage) return <UrgentHelpState />;
  const nonUrgentEmptyReason =
    emptyReason === "unrecognized_query" ? "unrecognized_query" : "no_matching_therapists";

  return (
    <>
      <ResultsHeader
        q={contract.q}
        count={results.length}
        hasFilters={hasAnyExplicitFilter(contract)}
      />
      {results.length === 0 ? (
        <EmptyState reason={nonUrgentEmptyReason} />
      ) : (
        <ResultsGrid results={results} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Legacy flow — DEV-only comparison surface                           */
/* ------------------------------------------------------------------ */

function LegacySearchResults({ search }: { search: SearchParams }) {
  const navigate = useNavigate();
  const returnTo = useRouterState({
    select: (s) => buildSearchReturn(s.location.pathname, s.location.searchStr),
  });
  const { data: structuredMatches } = useSuspenseQuery(structuredTherapistQuery(search.q));
  const { data: legacyPipeline } = useSuspenseQuery(resultsQuery(search));

  const isClarification = legacyPipeline?.mode === "clarification";
  const results: ScoredTherapist[] =
    legacyPipeline && legacyPipeline.mode !== "clarification" ? legacyPipeline.therapists : [];
  useSearchAnalytics({
    search,
    mode: legacyPipeline?.mode ?? "results",
    count: results.length,
    isClarification,
  });
  const contract = toUnifiedParams(search);

  return (
    <>
      <ResultsHeader
        q={contract.q}
        count={isClarification ? null : results.length}
        hasFilters={hasAnyExplicitFilter(contract)}
      />

      {structuredMatches && structuredMatches.length > 0 && (
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
                  search={returnTo ? { ret: returnTo } : {}}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-brand hover:bg-brand/5"
                >
                  <span className="font-medium">{m.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.professional_title}
                    {m.city ? ` · ${m.city}` : ""}
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
        <EmptyState reason="no_matching_therapists" />
      ) : (
        <ResultsGrid results={results.map(legacyRowToCard)} />
      )}
    </>
  );
}

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const flow = resolveFlowFromEnv(search.flow);
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);
  const contract = toUnifiedParams(search);
  const [quickFilters, setQuickFilters] = useState<string[] | undefined>(undefined);

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
          language: contract.language,
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
        }}
        preserveSearch={
          import.meta.env.DEV ? { problem: search.problem, flow: search.flow } : undefined
        }
        variant="compact"
        availableQuickFilters={flow === "unified" ? quickFilters : undefined}
      />

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
                search: {
                  ...search,
                  flow: flow === "unified" ? "legacy" : "unified",
                },
              })
            }
          >
            switch to {flow === "unified" ? "legacy" : "unified"}
          </button>
        </div>
      )}

      {/* Exactly ONE branch is mounted. In production `flow` is always
          "unified", so the Legacy and structured queries are never
          instantiated and a failure there cannot affect Unified. */}
      <SearchResultsSwitch flow={flow} search={search} onQuickFiltersChange={setQuickFilters} />
    </div>
  );
}
