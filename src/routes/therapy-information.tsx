import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicRouteError } from "@/components/public-route-error";
import { listPublishedProblemSeoContent, PROBLEM_SEO_GROUPS } from "@/lib/problem-seo-content";
import { toPublicProblemSlug } from "@/lib/problem-public-url";
import { absoluteUrl, encodePathSegment, serializeJsonLd, SITE_ORIGIN } from "@/lib/seo";
import { listProblems } from "@/lib/therapists.functions";

const HUB_TITLE = "תחומי טיפול והתמודדות | טיפולינקס";
const HUB_DESCRIPTION =
  "מידע כללי על תחומי טיפול והתמודדויות נפוצות, לצד קישורים למטפלים ואנשי מקצוע לפי הצורך, המיקום, השפה ואופן המפגש.";

const publishedContent = listPublishedProblemSeoContent();

export const Route = createFileRoute("/therapy-information")({
  loader: async () => {
    const activeProblems = new Map((await listProblems()).map((problem) => [problem.slug, problem] as const));

    return publishedContent.flatMap((content) => {
      const problem = activeProblems.get(content.slug);
      if (!problem) return [];
      return [
        {
          slug: content.slug,
          name: problem.name ?? content.label,
          group: content.group,
          summary: content.summary,
        },
      ];
    });
  },
  head: ({ loaderData }) => {
    const canonical = absoluteUrl("/therapy-information");
    const pages = loaderData ?? [];
    return {
      meta: [
        { title: HUB_TITLE },
        { name: "description", content: HUB_DESCRIPTION },
        { property: "og:title", content: HUB_TITLE },
        { property: "og:description", content: HUB_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                "@id": `${canonical}#page`,
                url: canonical,
                name: HUB_TITLE,
                description: HUB_DESCRIPTION,
                inLanguage: "he-IL",
                isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: pages.length,
                  itemListElement: pages.map((page, index) => ({
                    "@type": "ListItem",
                    position: index + 1,
                    name: page.name,
                    url: absoluteUrl(`/problems/${encodePathSegment(toPublicProblemSlug(page.slug))}`),
                  })),
                },
              },
              {
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
                    item: canonical,
                  },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  component: TherapyInformationPage,
  errorComponent: ({ error, reset }) => (
    <PublicRouteError
      error={error}
      reset={reset}
      boundary="therapy_information_route"
      title="לא הצלחנו לטעון את תחומי הטיפול"
      message="אירעה שגיאה זמנית בטעינת עמוד המידע. נסו שוב בעוד רגע או חזרו לדף הבית."
    />
  ),
});

function TherapyInformationPage() {
  const pages = Route.useLoaderData();
  const groups = PROBLEM_SEO_GROUPS.map((group) => ({
    ...group,
    pages: pages.filter((page) => page.group === group.id),
  })).filter((group) => group.pages.length > 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-soft/35 via-background to-background">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <nav aria-label="פירורי לחם" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground hover:underline">
            דף הבית
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-foreground">
            תחומי טיפול
          </span>
        </nav>

        <header className="mt-5 rounded-3xl border border-brand/15 bg-surface-elevated/90 p-7 shadow-card sm:p-10">
          <p className="text-sm font-semibold text-primary">מידע וחיפוש לפי צורך</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            תחומי טיפול והתמודדות
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
            לא תמיד צריך לדעת מראש איזה מקצוע או שיטת טיפול לחפש. בחרו נושא שמתאר את הצורך שלכם, קראו מידע כללי והמשיכו
            לרשימת מטפלים ואנשי מקצוע רלוונטיים.
          </p>
        </header>

        <div className="mt-10 space-y-12">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`group-${group.id}`}>
              <h2 id={`group-${group.id}`} className="text-2xl font-bold text-foreground">
                {group.label}
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.pages.map((page) => (
                  <Link
                    key={page.slug}
                    to="/problems/$slug"
                    params={{ slug: toPublicProblemSlug(page.slug) }}
                    className="group flex min-h-52 flex-col rounded-3xl border border-border bg-surface-elevated p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
                  >
                    <h3 className="text-xl font-bold text-foreground transition-colors group-hover:text-primary">
                      {page.name}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">{page.summary}</p>
                    <span className="mt-5 text-sm font-semibold text-primary">מידע ומטפלים בתחום ←</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="mt-12 rounded-2xl border border-border bg-muted/35 p-5 text-sm leading-7 text-muted-foreground">
          המידע בעמודים הוא מידע כללי בלבד ואינו אבחון, המלצה רפואית או תחליף לייעוץ מקצועי. ההתאמה בפועל תלויה בצורך
          האישי ובהכשרה של איש המקצוע.
        </aside>
      </div>
    </main>
  );
}
