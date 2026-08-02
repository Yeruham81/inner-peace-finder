import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_LLM_SEMANTIC_MODEL,
  LLM_MAX_REMAINDER_LENGTH,
  LLM_MAX_PROVIDER_ATTEMPTS,
  LLM_MAX_RESPONSE_BYTES,
  LLM_PROVIDER_ID,
  LLM_REQUEST_TIMEOUT_MS,
  createProviderConfig,
  envFromRecord,
  loadProviderConfigFromEnv,
} from "./llm-provider-config";
import { LlmSemanticError } from "./llm-semantic-contract";

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LlmSemanticError);
    return (e as LlmSemanticError).code;
  }
  throw new Error("expected a thrown LlmSemanticError");
}

describe("documented constants", () => {
  it("pins provider identity, timeout, sizes and retry policy", () => {
    expect(LLM_PROVIDER_ID).toBe("lovable-ai-gateway");
    expect(LLM_REQUEST_TIMEOUT_MS).toBe(8000);
    expect(LLM_MAX_RESPONSE_BYTES).toBe(16384);
    expect(LLM_MAX_REMAINDER_LENGTH).toBe(500);
    expect(LLM_MAX_PROVIDER_ATTEMPTS).toBe(2);
  });
});

describe("configuration validation", () => {
  it("accepts injected safe fake configuration", () => {
    const cfg = createProviderConfig({ model: "m", apiKey: "k" });
    expect(cfg.model).toBe("m");
    expect(cfg.timeoutMs).toBe(LLM_REQUEST_TIMEOUT_MS);
    expect(cfg.maxAttempts).toBe(2);
    expect(cfg.structuredOutput).toBe(true);
  });

  it("fails clearly on missing model configuration", () => {
    expect(code(() => createProviderConfig({ apiKey: "k" }))).toBe("configuration_error");
  });

  it("fails clearly on empty model configuration", () => {
    expect(code(() => createProviderConfig({ model: "   ", apiKey: "k" }))).toBe(
      "configuration_error",
    );
  });

  it("fails clearly on missing credentials", () => {
    expect(code(() => createProviderConfig({ model: "m" }))).toBe("configuration_error");
    expect(code(() => createProviderConfig({ model: "m", apiKey: "" }))).toBe(
      "configuration_error",
    );
  });

  it("rejects invalid timeout and response-size configuration", () => {
    expect(code(() => createProviderConfig({ model: "m", apiKey: "k", timeoutMs: 0 }))).toBe(
      "configuration_error",
    );
    expect(code(() => createProviderConfig({ model: "m", apiKey: "k", timeoutMs: 1.5 }))).toBe(
      "configuration_error",
    );
    expect(
      code(() => createProviderConfig({ model: "m", apiKey: "k", maxResponseBytes: 10 })),
    ).toBe("configuration_error");
    expect(code(() => createProviderConfig({ model: "m", apiKey: "k", maxAttempts: 3 }))).toBe(
      "configuration_error",
    );
  });

  it("rejects a non-https endpoint", () => {
    expect(
      code(() => createProviderConfig({ model: "m", apiKey: "k", endpoint: "http://x/y" })),
    ).toBe("configuration_error");
  });
});

describe("server-side secret loading", () => {
  it("reads the credential and model only from server secret names", () => {
    const cfg = loadProviderConfigFromEnv(
      envFromRecord({ LOVABLE_API_KEY: "fake", LLM_SEMANTIC_MODEL: "custom/model" }),
    );
    expect(cfg.model).toBe("custom/model");
  });

  it("falls back to the documented default model", () => {
    const cfg = loadProviderConfigFromEnv(envFromRecord({ LOVABLE_API_KEY: "fake" }));
    expect(cfg.model).toBe(DEFAULT_LLM_SEMANTIC_MODEL);
  });

  it("fails when the credential secret is absent", () => {
    expect(code(() => loadProviderConfigFromEnv(envFromRecord({})))).toBe("configuration_error");
  });

  it("fails when the model override is present but empty", () => {
    expect(
      code(() =>
        loadProviderConfigFromEnv(
          envFromRecord({ LOVABLE_API_KEY: "fake", LLM_SEMANTIC_MODEL: "" }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("never reads client-public configuration", () => {
    const src = readFileSync(join(import.meta.dir, "llm-provider-config.ts"), "utf8");
    expect(src.includes("VITE_")).toBe(false);
    expect(src.includes("import.meta.env")).toBe(false);
  });
});