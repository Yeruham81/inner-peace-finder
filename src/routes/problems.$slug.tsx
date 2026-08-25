import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getProblemBySlug } from "@/lib/therapists.functions";
import { searchProblemResults } from "@/lib/query-interpreter.functions";
import { TherapistCard } from "@/components/therapist-card";
import { PublicRouteError } from "@/components/public-route-error";
import { getPublishedProblemSeoContent, type ProblemSeoContent } from "@/lib/problem-seo-content";
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
    queryFn: () => searchProblemResults({ data: { problemSlug: slug, limit: 20 } }),
  });
}

export const Route = createFileRoute("/problems/$slug")({
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(problemQuery(params.slug));
    if (!p) throw notFound();
    await context.queryClient.ensureQueryData(problemTherapistsQuery(params.slug));
    return p;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "תחום טיפול | טיפולינקס" }] };
    const name = loaderData?.name ?? "בעיה";
    const seoContent = getPublishedProblemSeoContent(loaderData.slug);
    const desc =
      seoContent?.metaDescription ?? loaderData?.description?.slice(0, 155) ?? `מידע כללי ומטפלים בתחום ${name}.`;
    const canonical = absoluteUrl(`/problems/${encodePathSegment(loaderData.slug)}`);
    const meta: Array<{ title?: string; name?: string; property?: string; content?: string }> = [
      { title: seoContent?.seoTitle ?? `${name} — תחום טיפול | טיפולינקס` },
      { name: "description", content: desc },
      { property: "og:title", content: seoContent?.seoTitle ?? `${name} | טיפולינקס` },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
    ];
    if (!seoContent) meta.push({ name: "robots", content: "noindex,follow" });

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
  const { slug } = Route.useParams();
  const { data: problem } = useSuspenseQuery(problemQuery(slug));
  const { data: pipeline } = useSuspenseQuery(problemTherapistsQuery(slug));
  if (!problem) return null;
  const therapists = pipeline.results;
  const seoContent = getPublishedProblemSeoContent(problem.slug);
  const relatedPages = (seoContent?.relatedSlugs ?? [])
    .map((relatedSlug) => getPublishedProblemSeoContent(relatedSlug))
    .filter((related): related is ProblemSeoContent => related !== null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="פירורי לחם" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-foreground hover:underline">
          דף הבית
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/therapy-information" className="transition-colors hover:text-foreground hover:underline">
          תחומי טיפול
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-foreground">
          {problem.name}
        </span>
      </nav>
      <header className="mt-3 rounded-3xl bg-gradient-to-br from-brand-soft to-background p-8 sm:p-10">
        <h1 className="text-3xl font-extrabold text-foreground sm:text-4xl">{problem.name}</h1>
        {(seoContent?.summary || problem.description) && (
          <p className="mt-3 max-w-3xl text-base leading-8 text-foreground/80 sm:text-lg">
            {seoContent?.summary ?? problem.description}
          </p>
        )}
      </header>

      {seoContent && (
        <article className="mt-8 space-y-8 rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm sm:p-8">
          <section aria-labelledby="about-topic">
            <h2 id="about-topic" className="text-2xl font-bold text-foreground">
              על ההתמודדות
            </h2>
            <p className="mt-3 text-base leading-8 text-muted-foreground">{seoContent.intro}</p>
          </section>

          <section aria-labelledby="common-situations">
            <h2 id="common-situations" className="text-xl font-bold text-foreground">
              מצבים שבהם אנשים מחפשים עזרה בנושא
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {seoContent.commonSituations.map((situation) => (
                <li
                  key={situation}
                  className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3 text-sm leading-7 text-foreground/85"
                >
                  {situation}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="finding-professional">
            <h2 id="finding-professional" className="text-xl font-bold text-foreground">
              איך מחפשים איש מקצוע מתאים?
            </h2>
            <p className="mt-3 text-base leading-8 text-muted-foreground">{seoContent.matchingGuidance}</p>
          </section>

          {relatedPages.length > 0 && (
            <section aria-labelledby="related-topics">
              <h2 id="related-topics" className="text-xl font-bold text-foreground">
                תחומים קשורים
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {relatedPages.map((related) => (
                  <Link
                    key={related.slug}
                    to="/problems/$slug"
                    params={{ slug: related.slug }}
                    className="rounded-full border border-brand/20 bg-brand-soft/45 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand/45 hover:text-primary"
                  >
                    {related.label}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <p className="rounded-2xl bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
            המידע בעמוד הוא מידע כללי בלבד ואינו אבחון, המלצה רפואית או תחליף לייעוץ מקצועי.
          </p>
        </article>
      )}

      {problem.children && problem.children.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">תתי-קטגוריות</h2>
          <div className="flex flex-wrap gap-2">
            {problem.children.map((c: { id: string | number; slug: string; name: string | null }) => (
              <Link
                key={c.id}
                to="/problems/$slug"
                params={{ slug: c.slug }}
                className="rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-brand-soft"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-foreground">
          מטפלים מומלצים{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (<span className="ltr-num">{therapists.length}</span>)
          </span>
        </h2>
        {therapists.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
            עוד אין מטפלים רשומים בקטגוריה זו.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {therapists.map((therapist, index) => (
              <TherapistCard key={therapist.id} t={therapist} rankPosition={index + 1} pageSource="problem" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
