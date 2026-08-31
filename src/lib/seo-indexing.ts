/**
 * Centralized launch/indexing policy.
 *
 * A page may only become indexable when ALL of the following hold:
 *  1. the server-controlled launch switch `TIPULINKS_SEARCH_INDEXING_ENABLED`
 *     is exactly `"true"`;
 *  2. the configured, validated production origin (`TIPULINKS_PUBLIC_ORIGIN`)
 *     is the canonical production site (`https://tipulinks.co.il`) — preview,
 *     staging, localhost and unknown hosts can never be indexable;
 *  3. the route itself is an intentional public SEO route;
 *  4. the page data is publicly eligible (published problem page, eligible
 *     published therapist, ...).
 *
 * Every ambiguous, missing, invalid or error state resolves to `noindex`.
 * Request headers (`Host`, `X-Forwarded-Host`, `Origin`, ...) are never
 * consulted, so a spoofed header cannot enable indexing.
 */

import { SITE_ORIGIN } from "./seo";
import { isEligibleRow } from "./search-eligibility";

export const SEO_INDEXING_ENV_VAR = "TIPULINKS_SEARCH_INDEXING_ENABLED";
export const SEO_PUBLIC_ORIGIN_ENV_VAR = "TIPULINKS_PUBLIC_ORIGIN";
/** Set once during SSR so the client renders the identical robots directive. */
export const SEO_INDEXING_GLOBAL_KEY = "__TIPULINKS_SEARCH_INDEXING__";

export type RobotsDirective = "index,follow" | "noindex,follow" | "noindex,nofollow";

/** Only the literal string `true` enables indexing. Anything else fails closed. */
export function parseIndexingFlag(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

/**
 * The configured origin is trusted only when it is a clean https origin that
 * equals the canonical production site.
 */
export function isTrustedProductionOrigin(raw: string | null | undefined): boolean {
  if (typeof raw !== "string" || raw.trim() === "") return false;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.search || parsed.hash) return false;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
    return parsed.origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

/** Combine the launch switch with the trusted-production-origin requirement. */
export function evaluateIndexingPolicy(input: { flag?: string | null; origin?: string | null }): boolean {
  try {
    return parseIndexingFlag(input.flag) && isTrustedProductionOrigin(input.origin);
  } catch {
    return false;
  }
}

/** Application-only areas that stay `noindex` regardless of launch state. */
export const PERMANENT_NOINDEX_PREFIXES = [
  "/search",
  "/admin",
  "/account",
  "/auth",
  "/reset-password",
  "/claim",
  "/new-profile",
  "/profile-preview-demo",
  "/api",
] as const;

/** Intentional public SEO routes — the only paths that may ever be indexable. */
export const SEO_ELIGIBLE_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/$/,
  /^\/for-therapists$/,
  /^\/therapy-information$/,
  /^\/privacy-policy$/,
  /^\/terms-of-use$/,
  /^\/problems\/[^/]+$/,
  /^\/therapists\/[^/]+$/,
];

function normalizePath(path: string): string | null {
  if (typeof path !== "string" || path === "") return null;
  let pathname = path;
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return null;
    }
  }
  // Query strings and fragments never make a route indexable on their own.
  pathname = pathname.split("?")[0]!.split("#")[0]!;
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  return pathname;
}

export function isPermanentlyNoindexPath(path: string): boolean {
  const pathname = normalizePath(path);
  if (pathname === null) return true;
  return PERMANENT_NOINDEX_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isSeoEligibleRoutePath(path: string): boolean {
  const pathname = normalizePath(path);
  if (pathname === null) return false;
  if (isPermanentlyNoindexPath(pathname)) return false;
  return SEO_ELIGIBLE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** The single place that turns the four inputs into a robots directive. */
export function robotsDirective(input: {
  indexingAllowed: boolean;
  routeEligible: boolean;
  pageEligible?: boolean;
}): RobotsDirective {
  const pageEligible = input.pageEligible ?? true;
  const indexable = input.indexingAllowed === true && input.routeEligible === true && pageEligible === true;
  return indexable ? "index,follow" : "noindex,follow";
}

function serverIndexingAllowed(): boolean {
  const env = typeof process !== "undefined" && process.env ? process.env : undefined;
  return evaluateIndexingPolicy({
    flag: env?.[SEO_INDEXING_ENV_VAR],
    origin: env?.[SEO_PUBLIC_ORIGIN_ENV_VAR],
  });
}

/**
 * Server: derived from the environment. Browser: the SSR-provided boolean, so
 * hydration renders exactly the directive crawlers received.
 */
export function searchIndexingAllowed(): boolean {
  if (typeof window === "undefined") return serverIndexingAllowed();
  return (window as unknown as Record<string, unknown>)[SEO_INDEXING_GLOBAL_KEY] === true;
}

/** Inline bootstrap so the browser can reproduce the server's decision. */
export function indexingBootstrapScript(): string {
  return `window.${SEO_INDEXING_GLOBAL_KEY}=${searchIndexingAllowed() ? "true" : "false"};`;
}

/**
 * Robots meta entry for a public SEO route's `head()`.
 * `path` must be the route's own canonical path; `pageEligible` carries
 * page/data eligibility (draft problem page, ineligible therapist, ...).
 */
export function seoRobotsMeta(path: string, pageEligible = true): { name: "robots"; content: RobotsDirective } {
  return {
    name: "robots",
    content: robotsDirective({
      indexingAllowed: searchIndexingAllowed(),
      routeEligible: isSeoEligibleRoutePath(path),
      pageEligible,
    }),
  };
}

/** Page-level eligibility for a therapist profile, reusing search eligibility. */
export function therapistSeoEligible(
  row:
    | null
    | undefined
    | {
        slug?: string | null;
        is_active?: boolean | null;
        profile_status?: string | null;
        visibility?: string | null;
        budget_hold_until?: string | null;
        do_not_republish?: boolean | null;
        profile_origin?: string | null;
        owner_account_id?: string | null;
        first_contact_reserved_at?: string | null;
        first_contact_sent_at?: string | null;
        owner_reviewed_at?: string | null;
      },
): boolean {
  if (!row || typeof row.slug !== "string" || row.slug.trim() === "") return false;
  const exposesStatus =
    row.is_active !== undefined || row.profile_status !== undefined || row.visibility !== undefined;
  // Trusted public reads already filter by eligibility; when the row carries
  // status fields we re-verify them so a draft/inactive row can never index.
  return exposesStatus ? isEligibleRow(row) : true;
}
