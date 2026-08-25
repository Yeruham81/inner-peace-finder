import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { absoluteUrl, encodePathSegment, serializeJsonLd, SITE_ORIGIN, xmlEscape } from "./seo";

const SRC = join(import.meta.dir, "..");
const PROJECT = join(SRC, "..");
const readSource = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("technical SEO foundation", () => {
  it("builds stable absolute production URLs and encoded dynamic paths", () => {
    expect(SITE_ORIGIN).toBe("https://tipulinks.co.il");
    expect(absoluteUrl("/")).toBe("https://tipulinks.co.il/");
    expect(absoluteUrl("problems/anxiety")).toBe("https://tipulinks.co.il/problems/anxiety");
    expect(encodePathSegment("חרדה חברתית")).toBe("%D7%97%D7%A8%D7%93%D7%94%20%D7%97%D7%91%D7%A8%D7%AA%D7%99%D7%AA");
  });

  it("serializes route data without allowing a closing script element", () => {
    const serialized = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual({ text: "</script><script>alert(1)</script>" });
    expect(xmlEscape("https://example.test/?a=1&b=2")).toBe("https://example.test/?a=1&amp;b=2");
  });

  it("publishes only indexable routes in an absolute dynamic sitemap", () => {
    const sitemap = readSource("routes/sitemap[.]xml.ts");
    expect(sitemap).toMatch(/xmlEscape\(\s*absoluteUrl\(e\.path\),?\s*\)/);
    expect(sitemap).toMatch(/path:\s*["']\/for-therapists["']/);
    expect(sitemap).toMatch(/path:\s*["']\/therapy-information["']/);
    expect(sitemap).toContain("listAllTherapistSlugs");
    expect(sitemap).toMatch(/isProblemSeoPublished\(\s*problem\.slug\s*\)/);
    expect(sitemap).toContain("toPublicProblemSlug(problem.slug)");
    expect(sitemap).not.toMatch(/path:\s*["']\/search["']/);
    expect(sitemap).not.toContain('const BASE_URL = ""');

    const robots = readFileSync(join(PROJECT, "public/robots.txt"), "utf8");
    expect(robots).toContain("Sitemap: https://tipulinks.co.il/sitemap.xml");
  });

  it("sets canonical links on every indexable public page", () => {
    for (const route of [
      "routes/index.tsx",
      "routes/for-therapists.tsx",
      "routes/therapy-information.tsx",
      "routes/problems.$slug.tsx",
      "routes/therapists.$slug.tsx",
    ]) {
      const source = readSource(route);
      expect(source, route).toContain('rel: "canonical"');
      expect(source, route).toContain('property: "og:url"');
    }
  });

  it("keeps search out of the index and publishes the completed information hub", () => {
    expect(readSource("routes/search.tsx")).toContain('{ name: "robots", content: "noindex,follow" }');
    expect(readSource("routes/therapy-information.tsx")).not.toContain('name: "robots"');
  });

  it("provides only the approved structured-data types", () => {
    const home = readSource("routes/index.tsx");
    expect(home).toContain('"@type": "Organization"');
    expect(home).toContain('"@type": "WebSite"');

    const problem = readSource("routes/problems.$slug.tsx");
    expect(problem).toContain('"@type": "BreadcrumbList"');

    const hub = readSource("routes/therapy-information.tsx");
    expect(hub).toContain('"@type": "CollectionPage"');
    expect(hub).toContain('"@type": "ItemList"');

    const therapist = readSource("routes/therapists.$slug.tsx");
    expect(therapist).toContain('"@type": "ProfilePage"');
    expect(therapist).toContain('"@type": "Person"');
    expect(therapist).toContain('"@type": "BreadcrumbList"');
    expect(therapist).not.toContain("license_number");
  });

  it("uses a broad site fallback instead of the old anxiety-only metadata", () => {
    const root = readSource("routes/__root.tsx");
    expect(root).toContain("טיפולינקס — פשוט למצוא את הטיפול המתאים");
    expect(root).not.toContain("פלטפורמה למציאת מטפלים בחרדה");
  });
});
