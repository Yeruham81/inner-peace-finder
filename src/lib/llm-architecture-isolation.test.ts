/**
 * Architecture guard for the connected Unified Search semantic route.
 *
 * The LLM is allowed only behind the server-only semantic orchestrator.
 * Client routes/components must never receive provider credentials, transport
 * code or direct provider access. Safety triage must precede that server
 * classifier on the production Unified path.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..");
const PURE_LLM_MODULES = ["llm-semantic-adapter", "llm-semantic-contract", "llm-semantic-prompt"];
const SERVER_LLM_MODULES = [
  "llm-provider-config",
  "llm-gateway-transport",
  "llm-classify-service",
  "llm-semantic-evaluator",
];
const LLM_MODULES = [...PURE_LLM_MODULES, ...SERVER_LLM_MODULES];
const SERVER_ORCHESTRATOR = "lib/unified-semantic-classifier.server.ts";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const PRODUCTION_FILES = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes("/test-support/"));
const CLIENT_SURFACE_FILES = PRODUCTION_FILES.filter(
  (f) =>
    (f.includes("/routes/") || f.includes("/components/")) && !f.endsWith(".server.ts") && !f.endsWith(".server.tsx"),
);

describe("LLM isolation", () => {
  it("finds production files to audit", () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(20);
  });

  it("client routes/components never import provider, transport or classify-service modules", () => {
    const serverBoundaryRe = new RegExp(`(?:${SERVER_LLM_MODULES.join("|")}|unified-semantic-classifier\\.server)`);
    const offenders = CLIENT_SURFACE_FILES.filter((f) => serverBoundaryRe.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the server-only Unified semantic orchestrator owns provider wiring", () => {
    const src = readFileSync(join(SRC, SERVER_ORCHESTRATOR), "utf8");
    expect(src).toContain('from "./llm-classify-service"');
    expect(src).toContain('from "./llm-provider-config"');
    expect(src).toContain('from "./llm-gateway-transport"');
    expect(src).toContain("SemanticEngine.loadCanonicalProblems");
    expect(src).toContain("SemanticEngine.classify");
  });

  it("production Unified Search dynamically enters the server classifier only after safety triage", () => {
    const src = readFileSync(join(SRC, "lib/query-interpreter.functions.ts"), "utf8");
    const safetyAt = src.indexOf("triageSearchSafety(query)");
    const urgentAt = src.indexOf('safetyTriage.status === "urgent"');
    const llmAt = src.indexOf('import("./unified-semantic-classifier.server")');
    expect(safetyAt).toBeGreaterThan(-1);
    expect(urgentAt).toBeGreaterThan(safetyAt);
    expect(llmAt).toBeGreaterThan(urgentAt);
  });

  it("the new canonical LLM catalog read does not depend on problem_intents", () => {
    const src = readFileSync(join(SRC, "lib/semantic-engine.ts"), "utf8");
    const start = src.indexOf("async function loadCanonicalProblems");
    const end = src.indexOf("Phase 17C.2", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toContain("problem_intents");

    // The legacy vocabulary still contains it temporarily for the explicit
    // deterministic fallback bridge, to be removed after live LLM evaluation.
    expect(src).toContain('from("problem_intents")');
  });

  it("no LLM feature flag or URL parameter exists", () => {
    const routes = walk(join(SRC, "routes")).filter((f) => !/\.test\.tsx?$/.test(f));
    for (const f of routes) {
      const src = readFileSync(f, "utf8").toLowerCase();
      expect(src.includes("usellm") || src.includes("use_llm") || src.includes("llm=")).toBe(false);
    }
  });

  it("the pure LLM contract/prompt/adapter contain no network or credential access", () => {
    for (const m of PURE_LLM_MODULES) {
      const src = readFileSync(join(SRC, "lib", `${m}.ts`), "utf8");
      expect(src.includes("fetch(")).toBe(false);
      expect(src.includes("process.env")).toBe(false);
      expect(src.includes("import.meta.env")).toBe(false);
      expect(src.toLowerCase().includes("apikey")).toBe(false);
    }
  });

  it("provider internals never read client-public configuration", () => {
    for (const m of SERVER_LLM_MODULES) {
      const src = readFileSync(join(SRC, "lib", `${m}.ts`), "utf8");
      expect(src.includes("import.meta.env")).toBe(false);
      expect(src.includes("VITE_")).toBe(false);
      // Environment access is centralized in the .server orchestrator.
      expect(src.includes("process.env")).toBe(false);
    }
  });

  it("only the server orchestrator may wire direct provider transport into non-LLM production code", () => {
    const nonLlm = PRODUCTION_FILES.filter(
      (f) => !LLM_MODULES.some((m) => f.includes(`/${m}.ts`)) && !f.endsWith(SERVER_ORCHESTRATOR),
    );
    const transportRe = /llm-gateway-transport|llm-provider-config|llm-classify-service/;
    const offenders = nonLlm.filter((f) => transportRe.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no client surface invokes an LLM Edge Function directly", () => {
    const offenders = CLIENT_SURFACE_FILES.filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes("classify-query") || src.includes("functions.invoke");
    });
    expect(offenders).toEqual([]);
  });
});
