import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { isPrivateSearchId } from "./private-search-query";

const route = readFileSync("src/routes/search.tsx", "utf8");
const form = readFileSync("src/components/search-form.tsx", "utf8");
const returns = readFileSync("src/lib/search-return.ts", "utf8");
const homepage = readFileSync("src/routes/index.tsx", "utf8");

describe("private free-text search", () => {
  it("uses opaque search ids", () => {
    expect(isPrivateSearchId("a".repeat(32))).toBe(true);
    expect(isPrivateSearchId("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isPrivateSearchId("חרדה")).toBe(false);
    expect(isPrivateSearchId("a".repeat(31))).toBe(false);
  });

  it("keeps raw q out of the /search URL contract", () => {
    expect(route).toContain("searchId:");
    expect(route).not.toMatch(/\n\s*q:\s*fallback\(/);
    expect(form).not.toContain("q: contract.q || undefined");
    expect(form).toContain("storePrivateSearchQuery");
    expect(form).toContain("const searchId =");
    expect(form).toMatch(/\n\s*searchId,\n/);
  });

  it("runs Unified Search with the recovered private query only", () => {
    expect(route).toContain("readPrivateSearchQuery(deps.searchId)");
    expect(route).toContain("query: p.q");
    expect(route).toContain("ssr: false");
  });

  it("strips retired q/flow parameters from return URLs", () => {
    expect(returns).toContain('params.delete("q")');
    expect(returns).toContain('params.delete("flow")');
  });

  it("does not put curated homepage topics into q", () => {
    const explorerStart = homepage.slice(homepage.indexOf("function ExplorerProblemPanel"));
    expect(explorerStart).toContain("problem: serializeMultiValue(problemSlugs)");
    expect(explorerStart).not.toContain("q: problem");
  });
  it("fails closed for retired raw q URLs instead of browsing all therapists", () => {
    expect(route).toContain('searchParams.has("q")');
    expect(route).toContain("if (!hasRetiredRawQuery && privateQuery !== null)");
    expect(route).toContain('url.searchParams.set("searchId", createPrivateSearchId())');
    expect(route).toContain("const queryUnavailable = hasRetiredRawQuery ||");
  });
});
