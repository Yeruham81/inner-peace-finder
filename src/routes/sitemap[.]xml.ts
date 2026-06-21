import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listProblems, listAllTherapistSlugs } from "@/lib/therapists.functions";

const BASE_URL = "";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [problems, therapistSlugs] = await Promise.all([
          listProblems(),
          listAllTherapistSlugs(),
        ]);
        const entries = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/search", changefreq: "weekly", priority: "0.7" },
          ...problems.map((p) => ({
            path: `/problems/${p.slug}`,
            changefreq: "weekly",
            priority: "0.8",
          })),
          ...therapistSlugs.map((s) => ({
            path: `/therapists/${s}`,
            changefreq: "monthly",
            priority: "0.6",
          })),
        ];
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...entries.map(
            (e) =>
              `  <url><loc>${BASE_URL}${e.path}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
          ),
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});