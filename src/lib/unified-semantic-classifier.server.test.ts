import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createProviderConfig } from "./llm-provider-config";
import type { LlmTransport } from "./llm-gateway-transport";
import { classifyUnifiedSemanticRemainder } from "./unified-semantic-classifier.server";

const catalog = [
  { slug: "anxiety", name: "חרדה ופחדים", aliases: ["חרדה"] },
  { slug: "relationships", name: "זוגיות והיקשרות", aliases: ["קושי בזוגיות"] },
  { slug: "sleep_difficulties", name: "קשיי שינה", aliases: ["נדודי שינה"] },
];

const config = createProviderConfig({ model: "test-model", apiKey: "test-key" });
const unusedSb = {} as SupabaseClient<Database>;

function scriptedTransport(rawContent: string | Error, calls: { count: number }): LlmTransport {
  return {
    providerId: "openai",
    async request() {
      calls.count += 1;
      if (rawContent instanceof Error) throw rawContent;
      return { rawContent, byteLength: Buffer.byteLength(rawContent) };
    },
  };
}

describe("Unified semantic server classifier", () => {
  it("skips the LLM for a complete exact curated alias", async () => {
    const calls = { count: 0 };
    const out = await classifyUnifiedSemanticRemainder("חרדה", unusedSb, {
      loadCatalog: async () => catalog,
      config,
      transport: scriptedTransport('{"matches":[],"abstained":true}', calls),
      fallbackClassify: async () => {
        throw new Error("fallback must not run");
      },
    });
    expect(calls.count).toBe(0);
    expect(out).toEqual({
      signals: [{ slug: "anxiety", confidence: 1 }],
      source: "deterministic_exact",
      fallbackUsed: false,
    });
  });

  it("uses the LLM for contextual free wording and validates canonical slugs", async () => {
    const calls = { count: 0 };
    const out = await classifyUnifiedSemanticRemainder("אני לא נרדם ומתעורר שוב ושוב", unusedSb, {
      loadCatalog: async () => catalog,
      config,
      transport: scriptedTransport(
        '{"matches":[{"slug":"sleep_difficulties","confidence":0.91}],"abstained":false}',
        calls,
      ),
      fallbackClassify: async () => {
        throw new Error("fallback must not run");
      },
    });
    expect(calls.count).toBe(1);
    expect(out.signals).toEqual([{ slug: "sleep_difficulties", confidence: 0.91 }]);
    expect(out.source).toBe("llm");
    expect(out.fallbackUsed).toBe(false);
  });

  it("keeps exact aliases authoritative when the LLM adds another contextual domain", async () => {
    const calls = { count: 0 };
    const out = await classifyUnifiedSemanticRemainder("חרדה בגלל קשר זוגי", unusedSb, {
      loadCatalog: async () => catalog,
      config,
      transport: scriptedTransport(
        '{"matches":[{"slug":"relationships","confidence":0.97},{"slug":"anxiety","confidence":0.4}],"abstained":false}',
        calls,
      ),
      fallbackClassify: async () => [],
    });
    expect(out.signals).toEqual([
      { slug: "anxiety", confidence: 1 },
      { slug: "relationships", confidence: 0.97 },
    ]);
  });

  it("rejects an invented LLM slug and uses the temporary deterministic fallback", async () => {
    const calls = { count: 0 };
    let fallbackCalls = 0;
    const out = await classifyUnifiedSemanticRemainder("קשה לי מאוד להירגע בזמן האחרון", unusedSb, {
      loadCatalog: async () => catalog,
      config,
      transport: scriptedTransport(
        '{"matches":[{"slug":"invented_domain","confidence":0.99}],"abstained":false}',
        calls,
      ),
      fallbackClassify: async () => {
        fallbackCalls += 1;
        return [{ slug: "anxiety", confidence: 0.72 }];
      },
    });
    expect(calls.count).toBe(1);
    expect(fallbackCalls).toBe(1);
    expect(out).toEqual({
      signals: [{ slug: "anxiety", confidence: 0.72 }],
      source: "deterministic_fallback",
      fallbackUsed: true,
    });
  });

  it("uses the deterministic fallback when provider configuration is unavailable", async () => {
    let fallbackCalls = 0;
    const out = await classifyUnifiedSemanticRemainder("ניסוח חופשי שלא תואם alias", unusedSb, {
      loadCatalog: async () => catalog,
      env: { get: () => undefined },
      fallbackClassify: async () => {
        fallbackCalls += 1;
        return [
          { slug: "legacy_unknown", confidence: 0.99 },
          { slug: "relationships", confidence: 0.68 },
        ];
      },
    });
    expect(fallbackCalls).toBe(1);
    expect(out.fallbackUsed).toBe(true);
    expect(out.signals).toEqual([{ slug: "relationships", confidence: 0.68 }]);
  });
});
