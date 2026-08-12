/**
 * Return-destination handling for the therapist contact flow.
 *
 * The therapist profile route carries an optional `ret` search param holding
 * the search-results URL the visitor came from. It is stored in the URL (not
 * in memory) so the destination survives refreshes and other navigation.
 *
 * Only the application's own therapist search-results route is accepted.
 */

export const DEFAULT_SEARCH_RETURN = "/search";
const SEARCH_PATH = "/search";

/**
 * Builds the `ret` value for links that originate from the search results.
 * Returns undefined when the current location is not the search-results route.
 */
export function buildSearchReturn(pathname: string, searchStr: string): string | undefined {
  if (pathname !== SEARCH_PATH) return undefined;
  const query =
    searchStr && searchStr !== "?" ? (searchStr.startsWith("?") ? searchStr : `?${searchStr}`) : "";
  return `${SEARCH_PATH}${query}`;
}

/**
 * Validates a stored return destination. Anything that is not an internal
 * therapist search-results path collapses to the default results page.
 */
export function sanitizeSearchReturn(raw: unknown): string {
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

  if (pathname !== SEARCH_PATH) return DEFAULT_SEARCH_RETURN;
  if (query.includes("//")) return DEFAULT_SEARCH_RETURN;
  return `${SEARCH_PATH}${query === "?" ? "" : query}`;
}

/**
 * Turns a stored return destination into router link options, so navigation
 * uses the project's typed `<Link to=... search=...>` convention. The value is
 * sanitized first, so the result always points at the search-results route.
 */
export function searchReturnLinkOptions(raw: unknown): {
  to: typeof SEARCH_PATH;
  search: Record<string, string | number | boolean>;
} {
  const value = sanitizeSearchReturn(raw);
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
