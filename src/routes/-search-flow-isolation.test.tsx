/**
 * Regression guard: /search has one implementation only — Unified Search.
 * The retired Legacy classifier, structured-search side path and flow switch
 * must not return through a future refactor.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("Unified-only search architecture", () => {
  it("the search route contains only the Unified query path", () => {
    const src = read("routes/search.tsx");
    expect(src).toContain("unifiedResultsQuery");
    expect(src).toContain("unifiedSearch");
    for (const retired of [
      "classifyAndSearch",
      "structuredTherapistQuery",
      "searchStructuredTherapists",
      "LegacySearchResults",
      "legacyRowToCard",
      "resolveFlow",
      "FLOW_VALUES",
      "flow=legacy",
      'queryKey: ["search"',
      'queryKey: ["structured-search"',
    ]) {
      expect(src, retired).not.toContain(retired);
    }
  });

  it("the retired Legacy-only modules are deleted", () => {
    for (const f of [
      "lib/structured-search.functions.ts",
      "lib/semantic-classifier.ts",
      "lib/search-clarification.ts",
    ]) {
      expect(existsSync(join(SRC, f)), f).toBe(false);
    }
  });

  it("the public therapist module contains no persisted-search path", () => {
    const src = read("lib/therapists.functions.ts");
    for (const retired of [
      "searchTherapists",
      "classifyAndSearch",
      "query_classifications",
      "semantic_search_logs",
      "logSemanticSearch",
    ]) {
      expect(src, retired).not.toContain(retired);
    }
  });

  it("keeps sensitive free-text out of the route search schema", () => {
    const src = read("routes/search.tsx");
    expect(src).toContain("searchId:");
    expect(src).toContain("readPrivateSearchQuery");
    expect(src).toContain("ssr: false");
    expect(src).not.toMatch(/\n\s*q:\s*fallback\(/);
  });
});
