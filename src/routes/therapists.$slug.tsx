import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getTherapistBySlug } from "@/lib/therapists.functions";
import { CtaCallButton } from "@/components/cta-call-button";

function therapistQuery(slug: string) {
  return queryOptions({
    queryKey: ["therapist", slug],
    queryFn: () => getTherapistBySlug({ data: { slug } }),
  });
}

export const Route = createFileRoute("/therapists/$slug")({
  loader: async ({ context, params }) => {
    const t = await context.queryClient.ensureQueryData(therapistQuery(params.slug));
    if (!t) throw notFound();
    return t;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "מטפל" }] };
    const title = `${loaderData.full_name} — ${loaderData.professional_title}`;
    const desc =
      loaderData.short_intro?.slice(0, 155) ??
      `${loaderData.full_name}, ${loaderData.professional_title} ב${loaderData.city}.`;
    const meta: Array<{ title?: string; name?: string; property?: string; content?: string }> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
    ];
    if (loaderData.image_url) {
      meta.push({ property: "og:image", content: loaderData.image_url });
      meta.push({ name: "twitter:image", content: loaderData.image_url });
    }
    return { meta };
  },
  component: TherapistPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6 text-center">
      <h1 className="text-xl font-semibold">שגיאה</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-10 text-center">
      <h1 className="text-2xl font-semibold">המטפל לא נמצא</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        חזרה לדף הבית
      </Link>
    </div>
  ),
});

function TherapistPage() {
  const { slug } = Route.useParams();
  const { data: t } = useSuspenseQuery(therapistQuery(slug));
  if (!t) return null;

  const subtypes = t.problems.filter((p) => p.slug !== "anxiety");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← דף הבית
      </Link>

      <article className="mt-3 overflow-hidden rounded-3xl border border-border bg-surface-elevated shadow-card">
        <div className="bg-gradient-to-br from-brand-soft to-surface p-6 sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {t.image_url && (
              <img
                src={t.image_url}
                alt={t.full_name}
                className="h-28 w-28 rounded-2xl object-cover ring-2 ring-surface-elevated shadow-card sm:h-32 sm:w-32"
              />
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">
                  {t.full_name}
                </h1>
                {t.verified && (
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-primary">
                    מאומת
                  </span>
                )}
              </div>
              <p className="mt-1 text-base text-muted-foreground">
                {t.professional_title}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground/80">
                <span>📍 {t.city}</span>
                <span>
                  <span className="ltr-num">{t.years_experience}</span> שנות ניסיון
                </span>
                {t.languages.length > 0 && (
                  <span>שפות: {t.languages.map((l) => l.name).join(" · ")}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 sm:p-10 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            {t.full_description && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">אודות</h2>
                <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-foreground/85">
                  {t.full_description}
                </p>
              </section>
            )}

            {subtypes.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">
                  תחומי טיפול
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subtypes.map((p) => (
                    <Link
                      key={p.id}
                      to="/problems/$slug"
                      params={{ slug: p.slug }}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-brand-soft"
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {t.populations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">
                  אוכלוסיות
                </h2>
                <p className="mt-2 text-sm text-foreground/80">
                  {t.populations.map((p) => p.name).join(" · ")}
                </p>
              </section>
            )}
          </div>

          <aside className="md:sticky md:top-20 md:self-start">
            <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
              <p className="text-sm text-muted-foreground">יצירת קשר ישיר</p>
              <p className="mt-1 text-sm text-foreground">
                הקליקו על הכפתור להתחלת שיחה. המטפל יראה את הפנייה.
              </p>
              <div className="mt-4">
                <CtaCallButton
                  therapistId={t.id}
                  therapistName={t.full_name}
                  pageSource="therapist_profile"
                />
              </div>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}