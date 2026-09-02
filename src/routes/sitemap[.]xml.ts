import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { isProblemSeoPublished } from "@/lib/problem-seo-content";
import { toPublicProblemSlug } from "@/lib/problem-public-url";
import { listProblems, listAllTherapistSlugs } from "@/lib/therapists.functions";
import { absoluteUrl, encodePathSegment, xmlEscape } from "@/lib/seo";
import { isSeoEligibleRoutePath, searchIndexingAllowed } from "@/lib/seo-indexing";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Pre-launch (or on any non-production origin) the sitemap must not
        // advertise the production SEO inventory. The same central policy that
        // drives page-level `noindex` gates it, so the two cannot contradict.
        const { readSystemSettings } = await import("@/lib/system-settings.server");
        const runtimeSettings = await readSystemSettings();
        if (!searchIndexingAllowed() || !runtimeSettings.searchIndexingEnabled) {
          return new Response(
            [
              `<?xml version="1.0" encoding="UTF-8"?>`,
              `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
              `</urlset>`,
            ].join("\n"),
            {
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, max-age=300",
              },
            },
          );
        }

        const [problems, therapistSlugs] = await Promise.all([listProblems(), listAllTherapistSlugs()]);

        const entries = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          {
            path: "/for-therapists",
            changefreq: "monthly",
            priority: "0.7",
          },
          {
            path: "/therapy-information",
            changefreq: "monthly",
            priority: "0.8",
          },
          ...problems
            .filter((problem) => isProblemSeoPublished(problem.slug))
            .map((problem) => ({
              path: `/problems/${encodePathSegment(toPublicProblemSlug(problem.slug))}`,
              changefreq: "monthly",
              priority: "0.8",
            })),
          ...therapistSlugs.map((s) => ({
            path: `/therapists/${encodePathSegment(s)}`,
            changefreq: "monthly",
            priority: "0.6",
          })),
          // Defence in depth: nothing outside the indexable route allowlist can
          // reach the sitemap even if an entry is added above by mistake.
        ].filter((entry) => isSeoEligibleRoutePath(entry.path));

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...entries.map(
            (e) =>
              `  <url><loc>${xmlEscape(absoluteUrl(e.path))}</loc><changefreq>${e.changefreq}</changefreq><priority>${
                e.priority
              }</priority></url>`,
          ),
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
