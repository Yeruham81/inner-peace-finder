/**
 * Architecture guard: production Unified Search must NOT instantiate or invoke
 * the LLM semantic boundary. The deterministic SemanticEngine stays the only
 * semantic classifier in production.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..");
const LLM_MODULES = ["llm-semantic-adapter", "llm-semantic-contract", "llm-semantic-prompt"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const PRODUCTION_FILES = walk(SRC).filter(
  (f) => !/\.test\.tsx?$/.test(f) && !f.includes("/test-support/") && !LLM_MODULES.some((m) => f.includes(m)),
);

describe("LLM isolation", () => {
  it("finds production files to audit", () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(20);
  });

  it("no production module imports the LLM semantic boundary", () => {
    const offenders = PRODUCTION_FILES.filter((f) => {
      const src = readFileSync(f, "utf8");
      return LLM_MODULES.some((m) => src.includes(`llm-semantic`) && src.includes(m));
    });
    expect(offenders).toEqual([]);
  });

  it("the unified search pipeline references only the deterministic SemanticEngine", () => {
    for (const file of [
      "lib/query-interpreter.functions.ts",
      "lib/unified-search-executor.ts",
      "lib/unified-search.ts",
      "routes/search.tsx",
    ]) {
      const src = readFileSync(join(SRC, file), "utf8");
      expect(src.includes("llm-semantic")).toBe(false);
      expect(src.toLowerCase().includes("llmsemanticclassifier")).toBe(false);
    }
  });

  it("no LLM feature flag or URL parameter exists", () => {
    const routes = walk(join(SRC, "routes")).filter((f) => !/\.test\.tsx?$/.test(f));
    for (const f of routes) {
      const src = readFileSync(f, "utf8").toLowerCase();
      expect(src.includes("uselm") || src.includes("use_llm") || src.includes("llm=")).toBe(false);
    }
  });

  it("the LLM boundary contains no network call or credential access", () => {
    for (const m of LLM_MODULES) {
      const src = readFileSync(join(SRC, "lib", `${m}.ts`), "utf8");
      expect(src.includes("fetch(")).toBe(false);
      expect(src.includes("process.env")).toBe(false);
      expect(src.includes("import.meta.env")).toBe(false);
      expect(src.toLowerCase().includes("apikey")).toBe(false);
    }
  });
});