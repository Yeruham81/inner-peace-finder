import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_PROBLEM_SLUGS } from "./homepage-problem-map";
import {
  getPublishedProblemSeoContent,
  hasCompleteProblemSeoContent,
  isProblemSeoPublished,
  listPublishedProblemSeoContent,
  problemSeoStatus,
  PROBLEM_SEO_GROUPS,
} from "./problem-seo-content";
import { publicProblemPath, toInternalProblemSlug, toPublicProblemSlug } from "./problem-public-url";

const SRC = join(import.meta.dir, "..");
const readSource = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("problem SEO publication", () => {
  const published = listPublishedProblemSeoContent();

  it("starts with a controlled set of 12 complete landing pages", () => {
    expect(published).toHaveLength(12);
    expect(new Set(published.map((content) => content.slug)).size).toBe(12);

    for (const content of published) {
      expect(content.status, content.slug).toBe("published");
      expect(hasCompleteProblemSeoContent(content), content.slug).toBe(true);
      expect(CANONICAL_PROBLEM_SLUGS).toContain(content.slug);
      expect(content.resultsHeading).not.toContain("מומלצים");
    }
  });

  it("treats every absent or incomplete canonical page as a draft", () => {
    expect(problemSeoStatus("pelvic_floor")).toBe("draft");
    expect(isProblemSeoPublished("pelvic_floor")).toBe(false);
    expect(getPublishedProblemSeoContent("not-a-canonical-problem")).toBeNull();
  });

  it("keeps catalog identifiers internal and publishes hyphenated topic URLs", () => {
    for (const slug of CANONICAL_PROBLEM_SLUGS) {
      expect(toInternalProblemSlug(toPublicProblemSlug(slug)), slug).toBe(slug);
    }
    expect(publicProblemPath("emotional_regulation")).toBe("/problems/emotional-regulation");
    expect(toInternalProblemSlug("sleep-difficulties")).toBe("sleep_difficulties");
    for (const content of published) {
      expect(toPublicProblemSlug(content.slug), content.slug).not.toContain("_");
    }
  });

  it("keeps group ids and related pages inside the published catalog", () => {
    const groupIds = new Set(PROBLEM_SEO_GROUPS.map((group) => group.id));
    const publishedSlugs = new Set(published.map((content) => content.slug));

    for (const content of published) {
      expect(groupIds.has(content.group), content.slug).toBe(true);
      expect(content.relatedSlugs).not.toContain(content.slug);
      for (const relatedSlug of content.relatedSlugs) {
        expect(publishedSlugs.has(relatedSlug), `${content.slug} -> ${relatedSlug}`).toBe(true);
      }
    }
  });

  it("does not place diagnostic or guaranteed-outcome claims in editorial copy", () => {
    const copy = JSON.stringify(published);
    expect(copy).not.toMatch(/מבטיח(?:ה|ים)?|מרפא(?:ה|ים)?|אבחון עצמי/);
  });

  it("marks draft problem routes noindex while preserving access for users", () => {
    const route = readSource("routes/problems.$slug.tsx");
    expect(route).toContain("getPublishedProblemSeoContent(loaderData.slug)");
    expect(route).toContain('{ name: "robots", content: "noindex,follow" }');
    expect(route).toContain("toInternalProblemSlug(params.slug)");
    expect(route).toContain("toPublicProblemSlug(loaderData.slug)");
    expect(route).toContain("statusCode: 301");
    // Prettier may wrap the conditional after `seoContent`; keep this assertion whitespace-safe.
    expect(route).toMatch(/\bscripts:\s*seoContent\s*\?/);
  });

  it("lists only published problem pages in the sitemap and hub", () => {
    const sitemap = readSource("routes/sitemap[.]xml.ts");
    const hub = readSource("routes/therapy-information.tsx");
    expect(sitemap).toMatch(/isProblemSeoPublished\(\s*problem\.slug\s*\)/);
    expect(sitemap).toContain("toPublicProblemSlug(problem.slug)");
    expect(hub).toContain("listPublishedProblemSeoContent");
    expect(hub).toContain('to="/problems/$slug"');
    expect(hub).toContain("toPublicProblemSlug(page.slug)");
  });

  it("describes topic professionals without recommendations and shows related topics last", () => {
    const route = readSource("routes/problems.$slug.tsx");
    expect(route).not.toContain("מטפלים מומלצים");
    expect(route).toContain("seoContent?.resultsHeading");
    expect(route).toContain("אנשי מקצוע שהנושא מופיע בין תחומי הטיפול שהציגו בפרופיל");
    expect(route.indexOf('pageSource="problem"')).toBeLessThan(route.indexOf('aria-labelledby="related-topics"'));
    expect(readSource("components/therapist-profile-view.tsx")).toContain("toPublicProblemSlug(item.problemSlug)");
  });
});
