import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listFilterOptions, listProblems } from "@/lib/therapists.functions";
import { SearchForm } from "@/components/search-form";

const filterOptionsQuery = queryOptions({
  queryKey: ["filter-options"],
  queryFn: () => listFilterOptions(),
});
const problemsQuery = queryOptions({
  queryKey: ["problems"],
  queryFn: () => listProblems(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "מטפלים לחרדה — חיפוש לפי בעיה ותחושה" },
      {
        name: "description",
        content:
          "חפשו מטפלים לחרדה לפי הבעיה שמטרידה אתכם: התקפי פאניקה, חרדה חברתית, פוביות, דאגנות יתר ועוד.",
      },
      { property: "og:title", content: "מטפלים לחרדה — חיפוש לפי בעיה" },
      {
        property: "og:description",
        content: "חפשו לפי תחושה: \"פאניקה לפני עבודה\", \"פחד מטיסה\", \"מחשבות טורדניות\".",
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(filterOptionsQuery),
      context.queryClient.ensureQueryData(problemsQuery),
    ]);
  },
  component: Index,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6 text-center text-foreground">
      <h1 className="text-xl font-semibold">לא הצלחנו לטעון את העמוד</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function Index() {
  const { data: filters } = useSuspenseQuery(filterOptionsQuery);
  const { data: problems } = useSuspenseQuery(problemsQuery);
  const subtypes = problems.filter((p) => p.parent_id !== null);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-soft via-background to-background" />
        <div className="mx-auto max-w-4xl px-4 pb-12 pt-12 sm:px-6 sm:pt-20">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-4 py-1.5 text-xs font-medium text-primary shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              תחום מומחיות: חרדה
            </span>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
              טיפול טוב מתחיל בהבנת הבעיה
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              מנוע חיפוש חכם שמבין מה אתם צריכים ומחבר אתכם לאנשי המקצוע המתאימים ביותר
            </p>
          </div>

          <div className="mt-8">
            <SearchForm
              cities={filters.cities}
              populations={filters.populations}
              languages={filters.languages}
            />
          </div>

          {/* Popular problems */}
          <div className="mt-8">
            <p className="mb-3 text-center text-sm font-medium text-muted-foreground">
              חיפושים נפוצים
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "פאניקה לפני עבודה",
                "פחד מטיסה",
                "מחשבות טורדניות",
                "חרדה חברתית",
                "חרדת מבחנים",
                "שחיקה בעבודה",
              ].map((term) => (
                <Link
                  key={term}
                  to="/search"
                  search={{ q: term }}
                  className="rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-brand-soft"
                >
                  {term}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Subtypes */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">
            סוגי חרדה
          </h2>
          <Link
            to="/problems/$slug"
            params={{ slug: "anxiety" }}
            className="text-sm font-medium text-primary hover:underline"
          >
            כל הקטגוריות ←
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subtypes.map((p) => (
            <Link
              key={p.id}
              to="/problems/$slug"
              params={{ slug: p.slug }}
              className="group rounded-2xl border border-border bg-surface-elevated p-5 shadow-card transition-all hover:border-brand/40 hover:-translate-y-0.5"
            >
              <h3 className="text-base font-semibold text-foreground group-hover:text-primary">
                {p.name}
              </h3>
              {p.description && (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                  {p.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
