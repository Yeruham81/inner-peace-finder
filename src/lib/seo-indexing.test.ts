import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_ORIGIN } from "./seo";
import {
  evaluateIndexingPolicy,
  isCanonicalProductionRequestUrl,
  isPermanentlyNoindexPath,
  isSeoEligibleRoutePath,
  parseIndexingFlag,
  isTrustedProductionOrigin,
  responseRobotsHeader,
  robotsDirective,
  seoRobotsMeta,
  therapistSeoEligible,
  SEO_INDEXING_ENV_VAR,
} from "./seo-indexing";

const SRC = join(import.meta.dir, "..");
const PROJECT = join(SRC, "..");
const readSource = (path: string) => readFileSync(join(SRC, path), "utf8");

const PROD = "https://tipulinks.co.il";
const PREVIEW = "https://id-preview--59f042d8-7af8-4c06-8dd0-1f370d0fe80f.lovable.app";

const publishedTherapist = {
  slug: "dana-levi",
  is_active: true,
  profile_status: "published",
  visibility: "published",
  budget_hold_until: null,
  do_not_republish: false,
  profile_origin: "self_service",
  owner_account_id: null,
  first_contact_reserved_at: null,
  first_contact_sent_at: null,
  owner_reviewed_at: null,
};

describe("central launch/indexing policy", () => {
  it("fails closed unless the launch switch is the exact literal true", () => {
    expect(evaluateIndexingPolicy({ flag: "true", origin: PROD })).toBe(true);
    for (const flag of [
      undefined,
      null,
      "",
      "1",
      "yes",
      "TRUE",
      "TRUE ",
      " true",
      "true ",
      "false",
      "False",
      "maybe",
    ]) {
      expect(evaluateIndexingPolicy({ flag, origin: PROD }), String(flag)).toBe(false);
      expect(parseIndexingFlag(flag), String(flag)).toBe(false);
    }
    expect(parseIndexingFlag("true")).toBe(true);
    expect(SEO_INDEXING_ENV_VAR).toBe("TIPULINKS_SEARCH_INDEXING_ENABLED");
  });

  it("allows indexing only from the canonical production origin", () => {
    expect(evaluateIndexingPolicy({ flag: "true", origin: PROD })).toBe(true);
    for (const origin of [
      PREVIEW,
      "https://sheli-lanu-sheli.lovable.app",
      "http://localhost:8080",
      "https://staging.tipulinks.co.il",
      "https://www.tipulinks.co.il",
      "http://tipulinks.co.il",
      "https://tipulinks.co.il/path",
      "https://tipulinks.co.il?x=1",
      "not-a-url",
      undefined,
    ]) {
      expect(evaluateIndexingPolicy({ flag: "true", origin }), String(origin)).toBe(false);
      expect(isTrustedProductionOrigin(origin ?? null), String(origin)).toBe(false);
    }
    expect(SITE_ORIGIN).toBe(PROD);
  });

  it("uses the actual request URL as an independent response-level production safeguard", () => {
    // This reproduces the important failure mode: preview receives the same
    // canonical origin + indexing flag as production. Configuration alone says
    // indexing is enabled, but the ACTUAL preview request must still be blocked.
    const productionLikeConfig = evaluateIndexingPolicy({ flag: "true", origin: PROD });
    expect(productionLikeConfig).toBe(true);

    expect(isCanonicalProductionRequestUrl(`${PROD}/therapists/dana-levi`)).toBe(true);
    expect(isCanonicalProductionRequestUrl(`${PREVIEW}/therapists/dana-levi`)).toBe(false);
    expect(isCanonicalProductionRequestUrl("http://localhost:3000/")).toBe(false);
    expect(isCanonicalProductionRequestUrl("not-a-url")).toBe(false);

    expect(
      responseRobotsHeader({
        requestUrl: `${PREVIEW}/therapists/dana-levi`,
        indexingAllowed: productionLikeConfig,
      }),
    ).toBe("noindex, nofollow");

    expect(
      responseRobotsHeader({
        requestUrl: `${PROD}/therapists/dana-levi`,
        indexingAllowed: productionLikeConfig,
      }),
    ).toBeNull();

    expect(
      responseRobotsHeader({
        requestUrl: `${PROD}/therapists/dana-levi`,
        indexingAllowed: false,
      }),
    ).toBe("noindex, follow");
  });

  it("always sends an X-Robots-compatible noindex policy for API URLs", () => {
    for (const requestUrl of [
      `${PROD}/api/public/voice/answer`,
      `${PROD}/api/public/whatsapp/lead-status`,
      `${PREVIEW}/api/public/email/lead-status`,
    ]) {
      expect(responseRobotsHeader({ requestUrl, indexingAllowed: true }), requestUrl).toBe("noindex, nofollow");
    }
  });

  it("combines all four inputs and resolves ambiguity to noindex", () => {
    expect(robotsDirective({ indexingAllowed: true, routeEligible: true, pageEligible: true })).toBe("index,follow");
    expect(robotsDirective({ indexingAllowed: false, routeEligible: true })).toBe("noindex,follow");
    expect(robotsDirective({ indexingAllowed: true, routeEligible: false })).toBe("noindex,follow");
    expect(robotsDirective({ indexingAllowed: true, routeEligible: true, pageEligible: false })).toBe("noindex,follow");
  });

  it("keeps private, application-only and search routes permanently noindex", () => {
    for (const path of [
      "/search",
      "/search?searchId=abc",
      "/search?q=stress&city=tel-aviv",
      "/admin",
      "/admin/therapists",
      "/account",
      "/account/leads",
      "/auth",
      "/auth?mode=signup",
      "/reset-password",
      "/claim",
      "/new-profile",
      "/profile-preview-demo",
      "/api/public/voice/answer",
    ]) {
      expect(isPermanentlyNoindexPath(path), path).toBe(true);
      expect(isSeoEligibleRoutePath(path), path).toBe(false);
      expect(seoRobotsMeta(path).content, path).toBe("noindex,follow");
    }
  });

  it("treats only intentional public SEO routes as route-eligible", () => {
    for (const path of [
      "/",
      "/for-therapists",
      "/therapy-information",
      "/privacy-policy",
      "/terms-of-use",
      "/problems/anxiety",
      "/therapists/dana-levi",
    ]) {
      expect(isSeoEligibleRoutePath(path), path).toBe(true);
    }
    for (const path of ["/unknown", "/problems", "/problems/a/b", "/therapists"]) {
      expect(isSeoEligibleRoutePath(path), path).toBe(false);
    }
  });

  it("keeps pages noindex in this (non-production) runtime, including the homepage", () => {
    // Tests run without the production launch switch, so every page — including
    // the homepage and eligible therapist pages — must stay noindex.
    expect(seoRobotsMeta("/").content).toBe("noindex,follow");
    expect(seoRobotsMeta("/therapists/dana-levi", true).content).toBe("noindex,follow");
  });

  it("blocks draft, inactive or hidden therapists from ever being indexable", () => {
    expect(therapistSeoEligible(publishedTherapist)).toBe(true);
    expect(therapistSeoEligible({ ...publishedTherapist, profile_status: "draft" })).toBe(false);
    expect(therapistSeoEligible({ ...publishedTherapist, is_active: false })).toBe(false);
    expect(therapistSeoEligible({ ...publishedTherapist, visibility: "hidden_by_owner" })).toBe(false);
    expect(therapistSeoEligible({ ...publishedTherapist, do_not_republish: true })).toBe(false);
    expect(therapistSeoEligible(null)).toBe(false);
    for (const row of [
      { ...publishedTherapist, profile_status: "draft" },
      { ...publishedTherapist, is_active: false },
    ]) {
      expect(
        robotsDirective({ indexingAllowed: true, routeEligible: true, pageEligible: therapistSeoEligible(row) }),
      ).toBe("noindex,follow");
    }
    // A published, eligible therapist on production with the switch on indexes.
    expect(
      robotsDirective({
        indexingAllowed: evaluateIndexingPolicy({ flag: "true", origin: PROD }),
        routeEligible: isSeoEligibleRoutePath("/therapists/dana-levi"),
        pageEligible: therapistSeoEligible(publishedTherapist),
      }),
    ).toBe("index,follow");
    // The same page on a preview origin never indexes.
    expect(
      robotsDirective({
        indexingAllowed: evaluateIndexingPolicy({ flag: "true", origin: PREVIEW }),
        routeEligible: true,
        pageEligible: true,
      }),
    ).toBe("noindex,follow");
  });

  it("wires the centralized policy into the root and public SEO routes only", () => {
    const root = readSource("routes/__root.tsx");
    expect(root).toContain("indexingBootstrapScript()");
    expect(root).toContain("robotsDirective({ indexingAllowed: false, routeEligible: false })");
    // The old hardcoded shell tag would have conflicted with route-level meta.
    expect(root).not.toContain('<meta name="robots" content="noindex,follow" />');

    for (const [route, call] of [
      ["routes/index.tsx", 'seoRobotsMeta("/")'],
      ["routes/for-therapists.tsx", 'seoRobotsMeta("/for-therapists")'],
      ["routes/therapy-information.tsx", 'seoRobotsMeta("/therapy-information")'],
      ["routes/privacy-policy.tsx", 'seoRobotsMeta("/privacy-policy")'],
      ["routes/terms-of-use.tsx", 'seoRobotsMeta("/terms-of-use")'],
    ] as const) {
      expect(readSource(route), route).toContain(call);
    }
    expect(readSource("routes/problems.$slug.tsx")).toContain("seoRobotsMeta(`/problems/");
    expect(readSource("routes/therapists.$slug.tsx")).toContain("therapistSeoEligible(loaderData)");

    // Search and every private area keep their own explicit noindex.
    expect(readSource("routes/search.tsx")).toContain('{ name: "robots", content: "noindex,follow" }');
    expect(readSource("routes/admin/route.tsx")).toContain('{ name: "robots", content: "noindex" }');
    expect(readSource("routes/_authenticated/account.tsx")).toContain(
      '{ name: "robots", content: "noindex,nofollow" }',
    );
    expect(readSource("routes/_authenticated/claim.tsx")).toContain('{ name: "robots", content: "noindex,nofollow" }');
    expect(readSource("routes/auth.tsx")).toContain('{ name: "robots", content: "noindex,nofollow" }');
  });

  it("keeps canonical URLs on the production domain and never on preview hosts", () => {
    for (const route of [
      "routes/index.tsx",
      "routes/for-therapists.tsx",
      "routes/therapy-information.tsx",
      "routes/problems.$slug.tsx",
      "routes/therapists.$slug.tsx",
      "routes/privacy-policy.tsx",
      "routes/terms-of-use.tsx",
    ]) {
      const source = readSource(route);
      expect(source, route).toContain('rel: "canonical"');
      expect(source, route).toContain("absoluteUrl(");
      expect(source, route).not.toContain("lovable.app");
      expect(source, route).not.toContain("localhost");
    }
  });

  it("applies the response-level SEO safety gate from the server entry", () => {
    const server = readSource("server.ts");
    expect(server).toContain("responseRobotsHeader");
    expect(server).toContain("requestUrl: request.url");
    expect(server).toContain('headers.set("X-Robots-Tag", robots)');
    expect(server).toContain("applySeoResponsePolicy(request, normalized)");
  });

  it("gates the sitemap on the same policy and keeps robots.txt crawlable", () => {
    const sitemap = readSource("routes/sitemap[.]xml.ts");
    expect(sitemap).toContain("searchIndexingAllowed()");
    expect(sitemap).toContain("isSeoEligibleRoutePath(entry.path)");
    expect(sitemap).toMatch(/isProblemSeoPublished\(\s*problem\.slug\s*\)/);
    expect(sitemap).toContain("listAllTherapistSlugs");
    expect(sitemap).not.toMatch(/path:\s*["']\/search["']/);
    expect(sitemap).not.toMatch(/path:\s*["']\/(admin|account|auth)/);

    // Every path literal in the sitemap must be route-eligible.
    for (const match of sitemap.matchAll(/path:\s*["'](\/[^"'`]*)["']/g)) {
      expect(isSeoEligibleRoutePath(match[1]!), match[1]!).toBe(true);
    }

    const robots = readFileSync(join(PROJECT, "public/robots.txt"), "utf8");
    expect(robots).toContain("Allow: /");
    expect(robots).not.toContain("Disallow: /");
    expect(robots).toContain(`Sitemap: ${PROD}/sitemap.xml`);
    expect(robots).not.toContain("lovable.app");
  });
});
