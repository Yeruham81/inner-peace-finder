/**
 * Browser-only storage for sensitive free-text therapist searches.
 *
 * The raw query is intentionally kept out of URLs and out of Supabase. It is
 * stored only for the lifetime of the current browser tab so refresh/back can
 * recover the search without turning personal text into a shareable URL.
 */

const STORAGE_PREFIX = "tipulinks.private-search.";
const PRIVATE_SEARCH_ID_PATTERN = /^[a-f0-9]{32}$/;
const memoryFallback = new Map<string, string>();

function normalizeQuery(rawQuery: string): string {
  return rawQuery.trim().slice(0, 200);
}

export function createPrivateSearchId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isPrivateSearchId(value: string | null | undefined): value is string {
  return typeof value === "string" && PRIVATE_SEARCH_ID_PATTERN.test(value);
}

export function storePrivateSearchQuery(rawQuery: string, existingSearchId?: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const query = normalizeQuery(rawQuery);
  if (!query) return undefined;

  const searchId = isPrivateSearchId(existingSearchId) ? existingSearchId : createPrivateSearchId();
  memoryFallback.set(searchId, query);

  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${searchId}`, query);
  } catch {
    // Some privacy-restricted browsers disable sessionStorage. The in-memory
    // fallback still supports navigation inside the current SPA session.
  }

  return searchId;
}

export function readPrivateSearchQuery(searchId: string | null | undefined): string | null {
  if (!isPrivateSearchId(searchId) || typeof window === "undefined") return null;

  try {
    const stored = window.sessionStorage.getItem(`${STORAGE_PREFIX}${searchId}`);
    if (stored !== null) {
      const query = normalizeQuery(stored);
      if (query) {
        memoryFallback.set(searchId, query);
        return query;
      }
    }
  } catch {
    // Fall through to the in-memory copy.
  }

  return memoryFallback.get(searchId) ?? null;
}
