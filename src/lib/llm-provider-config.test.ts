import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LLM_MAX_PROVIDER_ATTEMPTS,
  LLM_MAX_REMAINDER_LENGTH,
  LLM_MAX_RESPONSE_BYTES,
  LLM_PROVIDER_ENDPOINT,
  LLM_PROVIDER_ID,
  LLM_REQUEST_TIMEOUT_MS,
  createProviderConfig,
  envFromRecord,
  loadProviderConfigFromEnv,
} from "./llm-provider-config";
import { LlmSemanticError } from "./llm-semantic-contract";

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LlmSemanticError);
    return (error as LlmSemanticError).code;
  }

  throw new Error("expected a thrown LlmSemanticError");
}

describe("documented OpenAI provider constants", () => {
  it("pins the provider identity and Responses API endpoint", () => {
    expect(LLM_PROVIDER_ID).toBe("openai");
    expect(LLM_PROVIDER_ENDPOINT).toBe("https://api.openai.com/v1/responses");
  });

  it("pins timeout, size, input, and retry limits", () => {
    expect(LLM_REQUEST_TIMEOUT_MS).toBe(8_000);
    expect(LLM_MAX_RESPONSE_BYTES).toBe(16_384);
    expect(LLM_MAX_REMAINDER_LENGTH).toBe(500);
    expect(LLM_MAX_PROVIDER_ATTEMPTS).toBe(2);
  });
});

describe("explicit configuration validation", () => {
  it("accepts injected safe fake OpenAI configuration", () => {
    const config = createProviderConfig({
      model: "test-openai-model",
      apiKey: "test-api-key",
    });

    expect(config).toEqual({
      providerId: "openai",
      endpoint: "https://api.openai.com/v1/responses",
      model: "test-openai-model",
      apiKey: "test-api-key",
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
      maxResponseBytes: LLM_MAX_RESPONSE_BYTES,
      maxAttempts: LLM_MAX_PROVIDER_ATTEMPTS,
      structuredOutput: true,
    });
  });

  it("trims model, API-key, provider, and endpoint values", () => {
    const config = createProviderConfig({
      providerId: "  openai-test  ",
      endpoint: "  https://example.invalid/v1/responses  ",
      model: "  test-model  ",
      apiKey: "  test-key  ",
    });

    expect(config.providerId).toBe("openai-test");
    expect(config.endpoint).toBe("https://example.invalid/v1/responses");
    expect(config.model).toBe("test-model");
    expect(config.apiKey).toBe("test-key");
  });

  it("fails when model configuration is missing", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          apiKey: "test-api-key",
        }),
      ),
    ).toBe("configuration_error");
  });

  it("fails when model configuration is empty or whitespace-only", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "",
          apiKey: "test-api-key",
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "   ",
          apiKey: "test-api-key",
        }),
      ),
    ).toBe("configuration_error");
  });

  it("fails when API credentials are missing", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
        }),
      ),
    ).toBe("configuration_error");
  });

  it("fails when API credentials are empty or whitespace-only", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "",
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "   ",
        }),
      ),
    ).toBe("configuration_error");
  });

  it("rejects invalid timeout configuration", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          timeoutMs: 0,
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          timeoutMs: 1.5,
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          timeoutMs: 60_001,
        }),
      ),
    ).toBe("configuration_error");
  });

  it("rejects invalid response-size configuration", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          maxResponseBytes: 255,
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          maxResponseBytes: 1_000_001,
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          maxResponseBytes: 1.5,
        }),
      ),
    ).toBe("configuration_error");
  });

  it("rejects an invalid provider-attempt count", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          maxAttempts: 0,
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          maxAttempts: 3,
        }),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          maxAttempts: 1.5,
        }),
      ),
    ).toBe("configuration_error");
  });

  it("allows one or two total provider attempts", () => {
    const noRetry = createProviderConfig({
      model: "test-model",
      apiKey: "test-key",
      maxAttempts: 1,
    });

    const oneRetry = createProviderConfig({
      model: "test-model",
      apiKey: "test-key",
      maxAttempts: 2,
    });

    expect(noRetry.maxAttempts).toBe(1);
    expect(oneRetry.maxAttempts).toBe(2);
  });

  it("rejects a non-HTTPS endpoint", () => {
    expect(
      errorCode(() =>
        createProviderConfig({
          model: "test-model",
          apiKey: "test-key",
          endpoint: "http://example.invalid/v1/responses",
        }),
      ),
    ).toBe("configuration_error");
  });

  it("allows structured output to be explicitly disabled for tests", () => {
    const config = createProviderConfig({
      model: "test-model",
      apiKey: "test-key",
      structuredOutput: false,
    });

    expect(config.structuredOutput).toBe(false);
  });
});

describe("server-side OpenAI configuration loading", () => {
  it("reads the API key and model from OpenAI server-side names", () => {
    const config = loadProviderConfigFromEnv(
      envFromRecord({
        OPENAI_API_KEY: "fake-openai-key",
        OPENAI_MODEL: "test-openai-model",
      }),
    );

    expect(config.providerId).toBe("openai");
    expect(config.endpoint).toBe("https://api.openai.com/v1/responses");
    expect(config.apiKey).toBe("fake-openai-key");
    expect(config.model).toBe("test-openai-model");
  });

  it("fails when OPENAI_API_KEY is absent", () => {
    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_MODEL: "test-openai-model",
          }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("fails when OPENAI_API_KEY is empty or whitespace-only", () => {
    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_API_KEY: "",
            OPENAI_MODEL: "test-openai-model",
          }),
        ),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_API_KEY: "   ",
            OPENAI_MODEL: "test-openai-model",
          }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("fails when OPENAI_MODEL is absent", () => {
    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_API_KEY: "fake-openai-key",
          }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("fails when OPENAI_MODEL is empty or whitespace-only", () => {
    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_API_KEY: "fake-openai-key",
            OPENAI_MODEL: "",
          }),
        ),
      ),
    ).toBe("configuration_error");

    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_API_KEY: "fake-openai-key",
            OPENAI_MODEL: "   ",
          }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("does not fall back to a default model", () => {
    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            OPENAI_API_KEY: "fake-openai-key",
          }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("ignores obsolete Lovable gateway environment variables", () => {
    expect(
      errorCode(() =>
        loadProviderConfigFromEnv(
          envFromRecord({
            LOVABLE_API_KEY: "obsolete-key",
            LLM_SEMANTIC_MODEL: "google/gemini-2.5-flash",
          }),
        ),
      ),
    ).toBe("configuration_error");
  });

  it("does not read model or credential values from obsolete names", () => {
    const config = loadProviderConfigFromEnv(
      envFromRecord({
        OPENAI_API_KEY: "current-openai-key",
        OPENAI_MODEL: "current-openai-model",
        LOVABLE_API_KEY: "obsolete-lovable-key",
        LLM_SEMANTIC_MODEL: "obsolete-gemini-model",
      }),
    );

    expect(config.apiKey).toBe("current-openai-key");
    expect(config.model).toBe("current-openai-model");
  });

  it("never reads client-public configuration", () => {
    const source = readFileSync(join(import.meta.dir, "llm-provider-config.ts"), "utf8");

    expect(source.includes("VITE_")).toBe(false);
    expect(source.includes("NEXT_PUBLIC_")).toBe(false);
    expect(source.includes("PUBLIC_")).toBe(false);
    expect(source.includes("import.meta.env")).toBe(false);
  });

  it("contains no Lovable gateway or Gemini configuration", () => {
    const source = readFileSync(join(import.meta.dir, "llm-provider-config.ts"), "utf8");

    expect(source.includes("LOVABLE_API_KEY")).toBe(false);
    expect(source.includes("LLM_SEMANTIC_MODEL")).toBe(false);
    expect(source.includes("lovable-ai-gateway")).toBe(false);
    expect(source.includes("ai.gateway.lovable.dev")).toBe(false);
    expect(source.includes("google/gemini")).toBe(false);
    expect(source.includes("DEFAULT_LLM_SEMANTIC_MODEL")).toBe(false);
  });
});
