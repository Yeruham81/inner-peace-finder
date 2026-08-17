/**
 * Return-destination handling for the therapist contact flow.
 *
 * The therapist profile route carries an optional `ret` search param holding
 * the results URL the visitor came from. It is stored in the URL (not in
 * memory) so the destination survives refreshes and other navigation.
 *
 * Only the application's own results surfaces are accepted: `/search` and a
 * canonical `/problems/<slug>` page. Arbitrary internal paths remain invalid.
 */

export const DEFAULT_SEARCH_RETURN = "/search";
const SEARCH_PATH = "/search";
const PROBLEM_ROUTE_PATH = "/problems/$slug";
const PROBLEM_PATH_PATTERN = /^\/problems\/([a-z0-9]+(?:[-_][a-z0-9]+)*)$/;

function problemSlugFromPath(pathname: string): string | null {
  return pathname.match(PROBLEM_PATH_PATTERN)?.[1] ?? null;
}

/**
 * Builds the `ret` value for links that originate from a supported results
 * surface. Search parameters are preserved for `/search`; problem pages use
 * their canonical path without an arbitrary query string.
 */
export function buildResultsReturn(pathname: string, searchStr: string): string | undefined {
  if (pathname === SEARCH_PATH) {
    const query =
      searchStr && searchStr !== "?"
        ? searchStr.startsWith("?")
          ? searchStr
          : `?${searchStr}`
        : "";
    return `${SEARCH_PATH}${query}`;
  }
  if (problemSlugFromPath(pathname)) return pathname;
  return undefined;
}

/**
 * Validates a stored return destination. Anything that is not an allowlisted
 * internal results surface collapses to the default search page.
 */
export function sanitizeResultsReturn(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SEARCH_RETURN;
  const value = raw.trim();
  if (!value) return DEFAULT_SEARCH_RETURN;
  // Reject protocol-relative, absolute, backslash and control-character forms.
  const hasControlChar = [...value].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (value.startsWith("//") || value.includes("\\") || hasControlChar) {
    return DEFAULT_SEARCH_RETURN;
  }
  if (!value.startsWith("/")) return DEFAULT_SEARCH_RETURN;
  if (/^\/+\s*[a-z][a-z0-9+.-]*:/i.test(value)) return DEFAULT_SEARCH_RETURN;

  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : withoutHash.slice(queryIndex);

  if (pathname === SEARCH_PATH) {
    if (query.includes("//")) return DEFAULT_SEARCH_RETURN;
    return `${SEARCH_PATH}${query === "?" ? "" : query}`;
  }

  if (query === "" && problemSlugFromPath(pathname)) return pathname;
  return DEFAULT_SEARCH_RETURN;
}

export type ResultsReturnLinkOptions =
  | {
      to: typeof SEARCH_PATH;
      search: Record<string, string | number | boolean>;
    }
  | {
      to: typeof PROBLEM_ROUTE_PATH;
      params: { slug: string };
    };

/**
 * Turns a stored return destination into typed router link options. The value
 * is sanitized first, so the result always points at an allowlisted route.
 */
export function resultsReturnLinkOptions(raw: unknown): ResultsReturnLinkOptions {
  const value = sanitizeResultsReturn(raw);
  const problemSlug = problemSlugFromPath(value);
  if (problemSlug) {
    return { to: PROBLEM_ROUTE_PATH, params: { slug: problemSlug } };
  }

  const queryIndex = value.indexOf("?");
  const search: Record<string, string | number | boolean> = {};
  if (queryIndex !== -1) {
    const params = new URLSearchParams(value.slice(queryIndex + 1));
    for (const [key, val] of params.entries()) {
      if (val === "") continue;
      if (val === "true" || val === "false") {
        search[key] = val === "true";
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        search[key] = Number(val);
      } else {
        search[key] = val;
      }
    }
  }
  return { to: SEARCH_PATH, search };
}

/** Backwards-compatible names for the existing `/search` consumers. */
export const buildSearchReturn = buildResultsReturn;
export const sanitizeSearchReturn = sanitizeResultsReturn;
export const searchReturnLinkOptions = resultsReturnLinkOptions;
