import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  getProblemBySlug,
  searchTherapists,
} from "@/lib/therapists.functions";
import { TherapistCard } from "@/components/therapist-card";

function problemQuery(slug: string) {
  return queryOptions({
    queryKey: ["problem", slug],
    queryFn: () => getProblemBySlug({ data: { slug } }),
  });
}
function problemTherapistsQuery(slug: string) {
  return queryOptions({
    queryKey: ["problem-therapists", slug],
    queryFn: () => searchTherapists({ data: { problemSlug: slug } }),
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
    const name = loaderData?.name ?? "בעיה";
    const desc =
      loaderData?.description?.slice(0, 155) ??
      `מטפלים מומחים בטיפול ב${name} בישראל.`;
    return {
      meta: [
        { title: `${name} — מטפלים מומחים` },
        { name: "description", content: desc },
        { property: "og:title", content: `${name} — מטפלים מומחים` },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: ProblemPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6 text-center">
      <h1 className="text-xl font-semibold">שגיאה</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
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
  const { data: therapists } = useSuspenseQuery(problemTherapistsQuery(slug));
  if (!problem) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← דף הבית
      </Link>
      <header className="mt-3 rounded-3xl bg-gradient-to-br from-brand-soft to-background p-8 sm:p-10">
        <h1 className="text-3xl font-extrabold text-foreground sm:text-4xl">
          {problem.name}
        </h1>
        {problem.description && (
          <p className="mt-3 max-w-3xl text-base text-foreground/80 sm:text-lg">
            {problem.description}
          </p>
        )}
      </header>

      {problem.children && problem.children.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            תתי-קטגוריות
          </h2>
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
            {therapists.map((t) => (
              <TherapistCard key={t.id} t={legacyRowToCard(t)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}