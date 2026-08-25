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
    }
  });

  it("treats every absent or incomplete canonical page as a draft", () => {
    expect(problemSeoStatus("pelvic_floor")).toBe("draft");
    expect(isProblemSeoPublished("pelvic_floor")).toBe(false);
    expect(getPublishedProblemSeoContent("not-a-canonical-problem")).toBeNull();
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
    expect(route).toContain("seoContent ?");
  });

  it("lists only published problem pages in the sitemap and hub", () => {
    const sitemap = readSource("routes/sitemap[.]xml.ts");
    const hub = readSource("routes/therapy-information.tsx");
    expect(sitemap).toMatch(/isProblemSeoPublished\(\s*problem\.slug\s*\)/);
    expect(hub).toContain("listPublishedProblemSeoContent");
    expect(hub).toContain('to="/problems/$slug"');
  });
});
