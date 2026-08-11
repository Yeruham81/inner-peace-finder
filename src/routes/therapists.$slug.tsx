import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getTherapistBySlug } from "@/lib/therapists.functions";
import { TherapistProfileView } from "@/components/therapist-profile-view";

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

  return (
    <div className="min-h-screen bg-brand-soft/30">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <Link
          to="/"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          ← חזרה לחיפוש
        </Link>

        <div className="mt-4">
          <TherapistProfileView therapist={t} />
        </div>
      </div>
    </div>
  );
}
