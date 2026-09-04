import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getProblemBySlug } from "@/lib/therapists.functions";
import { searchProblemResults } from "@/lib/query-interpreter.functions";
import { TherapistCard } from "@/components/therapist-card";
import { PublicRouteError } from "@/components/public-route-error";
import { getPublishedProblemSeoContent, type ProblemSeoContent } from "@/lib/problem-seo-content";
import { toInternalProblemSlug, toPublicProblemSlug } from "@/lib/problem-public-url";
import { seoRobotsMeta } from "@/lib/seo-indexing";
import { absoluteUrl, encodePathSegment, serializeJsonLd } from "@/lib/seo";

function problemQuery(slug: string) {
  return queryOptions({
    queryKey: ["problem", slug],
    queryFn: () => getProblemBySlug({ data: { slug } }),
  });
}
function problemTherapistsQuery(slug: string) {
  return queryOptions({
    queryKey: ["unified-problem-therapists", slug],
    queryFn: () => searchProblemResults({ data: { problemSlug: slug } }),
  });
}

export const Route = createFileRoute("/problems/$slug")({
  loader: async ({ context, params }) => {
    const internalSlug = toInternalProblemSlug(params.slug);
    const p = await context.queryClient.ensureQueryData(problemQuery(internalSlug));
    if (!p) throw notFound();
    const publicSlug = toPublicProblemSlug(p.slug);
    if (params.slug !== publicSlug) {
      throw redirect({
        to: "/problems/$slug",
        params: { slug: publicSlug },
        statusCode: 301,
      });
    }
    await context.queryClient.ensureQueryData(problemTherapistsQuery(internalSlug));
    return p;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "תחום טיפול | טיפולינקס" }] };
    const name = loaderData?.name ?? "בעיה";
    const seoContent = getPublishedProblemSeoContent(loaderData.slug);
    const desc =
      seoContent?.metaDescription ?? loaderData?.description?.slice(0, 155) ?? `מידע כללי ומטפלים בתחום ${name}.`;
    const canonical = absoluteUrl(`/problems/${encodePathSegment(toPublicProblemSlug(loaderData.slug))}`);
    const meta: Array<{ title?: string; name?: string; property?: string; content?: string }> = [
      { title: seoContent?.seoTitle ?? `${name} — תחום טיפול | טיפולינקס` },
      { name: "description", content: desc },
      { property: "og:title", content: seoContent?.seoTitle ?? `${name} | טיפולינקס` },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
    ];
    // Draft/incomplete problem pages stay noindex; published ones follow the
    // central launch policy.
    if (!seoContent) meta.push({ name: "robots", content: "noindex,follow" });
    else meta.push(seoRobotsMeta(`/problems/${encodePathSegment(toPublicProblemSlug(loaderData.slug))}`, true));

    return {
      meta,
      links: [{ rel: "canonical", href: canonical }],
      scripts: seoContent
        ? [
            {
              type: "application/ld+json",
              children: serializeJsonLd({
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: "דף הבית",
                    item: absoluteUrl("/"),
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "תחומי טיפול",
                    item: absoluteUrl("/therapy-information"),
                  },
                  {
                    "@type": "ListItem",
                    position: 3,
                    name,
                    item: canonical,
                  },
                ],
              }),
            },
          ]
        : [],
    };
  },
  component: ProblemPage,
  errorComponent: ({ error, reset }) => (
    <PublicRouteError
      error={error}
      reset={reset}
      boundary="problem_route"
      title="לא הצלחנו לטעון את תחום הטיפול"
      message="אירעה שגיאה זמנית בטעינת התחום והמטפלים המתאימים. נסו שוב בעוד רגע או חזרו לדף הבית."
    />
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-10 text-center">
      <h1 className="text-2xl font-semibold">הבעיה לא נמצאה</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        חזרה לדף הבית
      </Link>
    </div>
  ),
});

function ProblemPage() {
  const loadedProblem = Route.useLoaderData();
  const { data: problem } = useSuspenseQuery(problemQuery(loadedProblem.slug));
  const { data: pipeline } = useSuspenseQuery(problemTherapistsQuery(loadedProblem.slug));
  if (!problem) return null;
  const therapists = pipeline.results;
  const seoContent = getPublishedProblemSeoContent(problem.slug);
  const relatedPages = (seoContent?.relatedSlugs ?? [])
    .map((relatedSlug) => getPublishedProblemSeoContent(relatedSlug))
    .filter((related): related is ProblemSeoContent => related !== null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-soft/20 via-background to-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <nav
          aria-label="פירורי לחם"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
        >
          <Link
            to="/"
            className="rounded-md px-1 py-0.5 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
          >
            דף הבית
          </Link>
          <span aria-hidden="true" className="text-muted-foreground/60">
            /
          </span>
          <Link
            to="/therapy-information"
            className="rounded-md px-1 py-0.5 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
          >
            תחומי טיפול
          </Link>
          <span aria-hidden="true" className="text-muted-foreground/60">
            /
          </span>
          <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">
            {problem.name}
          </span>
        </nav>
        <header className="mt-4 rounded-3xl border border-brand/15 bg-surface-elevated/95 p-6 shadow-card sm:mt-5 sm:p-9 lg:p-10">
          <h1 className="max-w-[26ch] text-balance text-[1.75rem] font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
            {problem.name}
          </h1>
          {(seoContent?.summary || problem.description) && (
            <p className="mt-4 max-w-[62ch] text-pretty text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              {seoContent?.summary ?? problem.description}
            </p>
          )}
        </header>

        {seoContent && (
          <article className="mt-8 divide-y divide-border/70 rounded-3xl border border-border bg-surface-elevated p-6 shadow-card sm:mt-10 sm:p-8 lg:p-10">
            <section aria-labelledby="about-topic" className="pb-7 sm:pb-8">
              <h2 id="about-topic" className="text-pretty text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                על ההתמודדות
              </h2>
              <p className="mt-3 max-w-[70ch] text-pretty text-base leading-8 text-muted-foreground">
                {seoContent.intro}
              </p>
            </section>

            <section aria-labelledby="common-situations" className="py-7 sm:py-8">
              <h2
                id="common-situations"
                className="text-pretty text-lg font-bold tracking-tight text-foreground sm:text-xl"
              >
                מצבים שבהם אנשים מחפשים עזרה בנושא
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {seoContent.commonSituations.map((situation) => (
                  <li
                    key={situation}
                    className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-pretty text-sm leading-7 text-foreground/85"
                  >
                    {situation}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="finding-professional" className="py-7 sm:py-8">
              <h2
                id="finding-professional"
                className="text-pretty text-lg font-bold tracking-tight text-foreground sm:text-xl"
              >
                איך מחפשים איש מקצוע מתאים?
              </h2>
              <p className="mt-3 max-w-[70ch] text-pretty text-base leading-8 text-muted-foreground">
                {seoContent.matchingGuidance}
              </p>
            </section>

            <div className="pt-7 sm:pt-8">
              <p className="max-w-[78ch] rounded-2xl border border-border/70 border-r-4 border-r-brand/50 bg-muted/30 p-4 text-pretty text-sm leading-7 text-muted-foreground">
                המידע בעמוד הוא מידע כללי בלבד ואינו אבחון, המלצה רפואית או תחליף לייעוץ מקצועי.
              </p>
            </div>
          </article>
        )}

        {problem.children && problem.children.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <h2 className="mb-3 text-base font-bold tracking-tight text-foreground sm:text-lg">תתי-קטגוריות</h2>
            <div className="flex flex-wrap gap-2">
              {problem.children.map((c: { id: string | number; slug: string; name: string | null }) => (
                <Link
                  key={c.id}
                  to="/problems/$slug"
                  params={{ slug: toPublicProblemSlug(c.slug) }}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm text-foreground shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10 sm:mt-12" aria-labelledby="topic-professionals">
          <h2 id="topic-professionals" className="text-pretty text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {seoContent?.resultsHeading ?? `מטפלים בתחום ${problem.name}`}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              (<span className="ltr-num">{therapists.length}</span>)
            </span>
          </h2>
          <p className="mt-2 max-w-[70ch] text-pretty text-sm leading-7 text-muted-foreground">
            אנשי מקצוע שהנושא מופיע בין תחומי הטיפול שהציגו בפרופיל.
          </p>
          {therapists.length === 0 ? (
            <p className="mt-5 rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-pretty text-muted-foreground">
              עוד אין אנשי מקצוע רשומים בתחום זה.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {therapists.map((therapist, index) => (
                <TherapistCard key={therapist.id} t={therapist} rankPosition={index + 1} pageSource="problem" />
              ))}
            </div>
          )}
        </section>

        {relatedPages.length > 0 && (
          <section
            aria-labelledby="related-topics"
            className="mt-10 rounded-3xl border border-border bg-surface-elevated p-6 shadow-card sm:mt-12 sm:p-8"
          >
            <h2 id="related-topics" className="text-pretty text-lg font-bold tracking-tight text-foreground sm:text-xl">
              תחומים קשורים
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {relatedPages.map((related) => (
                <Link
                  key={related.slug}
                  to="/problems/$slug"
                  params={{ slug: toPublicProblemSlug(related.slug) }}
                  className="inline-flex min-h-11 items-center rounded-full border border-brand/20 bg-brand-soft/40 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand/45 hover:bg-brand-soft/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {related.label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

