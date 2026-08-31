import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { getTherapistBySlug } from "@/lib/therapists.functions";
import { TherapistProfileView } from "@/components/therapist-profile-view";
import { PublicRouteError } from "@/components/public-route-error";
import { track } from "@/lib/analytics";
import { readRememberedResultsReturn, resultsReturnLinkOptions } from "@/lib/search-return";
import { seoRobotsMeta, therapistSeoEligible } from "@/lib/seo-indexing";
import { absoluteUrl, encodePathSegment, serializeJsonLd, SITE_ORIGIN } from "@/lib/seo";

function therapistQuery(slug: string) {
  return queryOptions({
    queryKey: ["therapist", slug],
    queryFn: () => getTherapistBySlug({ data: { slug } }),
  });
}

export const Route = createFileRoute("/therapists/$slug")({
  validateSearch: zodValidator(
    z.object({
      /** Allowlisted internal results URL to return to after a successful lead. */
      ret: z.string().optional(),
    }),
  ),
  loader: async ({ context, params }) => {
    const t = await context.queryClient.ensureQueryData(therapistQuery(params.slug));
    if (!t) throw notFound();
    return t;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "פרופיל מטפל | טיפולינקס" }] };
    const professionalTitle = loaderData.professional_title?.trim() || "מטפל/ת";
    const title = `${loaderData.full_name} — ${professionalTitle} | טיפולינקס`;
    const location = loaderData.city ? ` ב${loaderData.city}` : "";
    const desc = loaderData.short_intro?.slice(0, 155) ?? `${loaderData.full_name}, ${professionalTitle}${location}.`;
    const canonical = absoluteUrl(`/therapists/${encodePathSegment(loaderData.slug)}`);
    const meta: Array<{ title?: string; name?: string; property?: string; content?: string }> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: canonical },
      seoRobotsMeta(`/therapists/${encodePathSegment(loaderData.slug)}`, therapistSeoEligible(loaderData)),
    ];
    if (loaderData.image_url) {
      meta.push({ property: "og:image", content: loaderData.image_url });
      meta.push({ name: "twitter:image", content: loaderData.image_url });
    }
    const personId = `${canonical}#person`;
    return {
      meta,
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: serializeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "ProfilePage",
                "@id": `${canonical}#profile-page`,
                url: canonical,
                name: title,
                description: desc,
                inLanguage: "he-IL",
                isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
                mainEntity: { "@id": personId },
              },
              {
                "@type": "Person",
                "@id": personId,
                name: loaderData.full_name,
                jobTitle: loaderData.professional_title || undefined,
                description: loaderData.short_intro || undefined,
                image: loaderData.image_url || undefined,
                url: canonical,
                address: loaderData.city
                  ? {
                      "@type": "PostalAddress",
                      addressLocality: loaderData.city,
                      addressCountry: "IL",
                    }
                  : undefined,
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
                    name: loaderData.full_name,
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
  component: TherapistPage,
  errorComponent: ({ error, reset }) => (
    <PublicRouteError
      error={error}
      reset={reset}
      boundary="therapist_profile_route"
      title="לא הצלחנו לטעון את הפרופיל"
      message="אירעה שגיאה זמנית בטעינת פרופיל המטפל. נסו שוב בעוד רגע או חזרו לדף הבית."
    />
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
  const { ret } = Route.useSearch();
  const [rememberedReturn, setRememberedReturn] = useState("");
  useEffect(() => {
    if (!ret) setRememberedReturn(readRememberedResultsReturn());
  }, [ret]);
  const backToResults = resultsReturnLinkOptions(ret || rememberedReturn);
  const { data: t } = useSuspenseQuery(therapistQuery(slug));
  useEffect(() => {
    if (!t) return;
    track("therapist_profile_viewed", {
      therapist_id: t.id,
      page_source: "therapist_profile",
      origin: "TherapistPage",
    });
  }, [t]);
  if (!t) return null;

  const backLinkClass = "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

  return (
    <div className="min-h-screen overflow-x-clip bg-brand-soft/30">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        {backToResults.to === "/problems/$slug" ? (
          <Link to="/problems/$slug" params={backToResults.params} className={backLinkClass}>
            ← חזרה לחיפוש
          </Link>
        ) : (
          <Link to="/search" search={backToResults.search} className={backLinkClass}>
            ← חזרה לחיפוש
          </Link>
        )}

        <div className="mt-4 min-w-0 max-w-full">
          <TherapistProfileView therapist={t} />
        </div>
      </div>
    </div>
  );
}
