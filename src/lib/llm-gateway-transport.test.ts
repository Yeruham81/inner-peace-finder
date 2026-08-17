import { describe, expect, it } from "bun:test";
import { OPENAI_MAX_OUTPUT_TOKENS, OPENAI_RESPONSE_JSON_SCHEMA, createOpenAiTransport } from "./llm-gateway-transport";
import { LlmSemanticError } from "./llm-semantic-contract";
import { fakeProviderConfig } from "./test-support/fake-llm-transport";

const CONFIG = fakeProviderConfig({
  providerId: "openai",
  endpoint: "https://api.openai.com/v1/responses",
  model: "fake-openai-model-v9",
  apiKey: "fake-key-not-a-secret",
  maxResponseBytes: 1_024,
});

const VALID_SEMANTIC_RESULT = '{"matches":[],"abstained":true}';

function outputText(text: string): Record<string, unknown> {
  return {
    type: "output_text",
    text,
  };
}

function assistantMessage(content: unknown[]): Record<string, unknown> {
  return {
    type: "message",
    role: "assistant",
    status: "completed",
    content,
  };
}

function envelope(
  semanticContent = VALID_SEMANTIC_RESULT,
  overrides: {
    status?: string;
    output?: unknown[];
    usage?: unknown;
    incompleteDetails?: unknown;
    error?: unknown;
  } = {},
): string {
  return JSON.stringify({
    id: "resp_provider_native_request_id",
    object: "response",
    status: overrides.status ?? "completed",
    output: overrides.output ?? [assistantMessage([outputText(semanticContent)])],
    usage: overrides.usage ?? {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 8 },
      output_tokens: 4,
      total_tokens: 16,
    },
    ...(overrides.incompleteDetails !== undefined
      ? {
          incomplete_details: overrides.incompleteDetails,
        }
      : {}),
    ...(overrides.error !== undefined ? { error: overrides.error } : {}),
  });
}

function respond(
  body: string,
  options: {
    status?: number;
    contentLength?: string;
  } = {},
): Response {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }

  return new Response(body, {
    status: options.status ?? 200,
    headers,
  });
}

async function run(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, config = CONFIG) {
  return createOpenAiTransport(fetchImpl).request({
    system: "system instructions",
    user: "semantic input",
    config,
  });
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LlmSemanticError);
    return (error as LlmSemanticError).code;
  }

  throw new Error("expected rejection");
}

function encodedLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function envelopeAtSize(targetBytes: number): string {
  const base = envelope();
  const currentSize = encodedLength(base);

  if (currentSize > targetBytes) {
    throw new Error(`base envelope exceeds target: ${currentSize} > ${targetBytes}`);
  }

  /*
   * Trailing whitespace is valid JSON and lets the test reach an exact
   * response-size boundary without changing the provider envelope.
   */
  return base + " ".repeat(targetBytes - currentSize);
}

describe("OpenAI request formatting", () => {
  it("uses the configured OpenAI endpoint and provider identity", async () => {
    let seenUrl = "";

    const transport = createOpenAiTransport(async (url) => {
      seenUrl = url;
      return respond(envelope());
    });

    expect(transport.providerId).toBe("openai");

    await transport.request({
      system: "system instructions",
      user: "semantic input",
      config: CONFIG,
    });

    expect(seenUrl).toBe("https://api.openai.com/v1/responses");
  });

  it("sends Bearer authentication and strict Structured Outputs", async () => {
    let seenInit: RequestInit | undefined;

    const result = await run(async (_url, init) => {
      seenInit = init;
      return respond(envelope());
    });

    const headers = new Headers(seenInit?.headers);

    expect(headers.get("Authorization")).toBe("Bearer fake-key-not-a-secret");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has("Lovable-API-Key")).toBe(false);

    const body = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;

    expect(body.model).toBe("fake-openai-model-v9");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(OPENAI_MAX_OUTPUT_TOKENS);

    expect(body.input).toEqual([
      {
        role: "system",
        content: "system instructions",
      },
      {
        role: "user",
        content: "semantic input",
      },
    ]);

    expect(body.messages).toBeUndefined();
    expect(body.response_format).toBeUndefined();

    expect(body.text.format).toEqual({
      type: "json_schema",
      ...OPENAI_RESPONSE_JSON_SCHEMA,
    });

    expect(Object.keys(OPENAI_RESPONSE_JSON_SCHEMA.schema.properties).sort()).toEqual(["abstained", "matches"]);

    expect(result.rawContent).toBe(VALID_SEMANTIC_RESULT);
  });

  it("omits text.format when structured output is disabled", async () => {
    let seenInit: RequestInit | undefined;

    await run(
      async (_url, init) => {
        seenInit = init;
        return respond(envelope());
      },
      {
        ...CONFIG,
        structuredOutput: false,
      },
    );

    const body = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;

    expect(body.text).toBeUndefined();
    expect(body.store).toBe(false);
  });
});

describe("OpenAI response extraction", () => {
  it("returns semantic text and numeric usage only", async () => {
    const result = await run(async () => respond(envelope()));

    expect(result.rawContent).toBe(VALID_SEMANTIC_RESULT);
    expect(result.usage).toEqual({
      promptTokens: 12,
      cachedTokens: 8,
      completionTokens: 4,
    });

    expect(Object.keys(result).sort()).toEqual(["byteLength", "rawContent", "usage"]);

    expect(JSON.stringify(result).includes("resp_provider_native_request_id")).toBe(false);
  });

  it("ignores invalid cached-token metadata without failing classification", async () => {
    const result = await run(async () =>
      respond(
        envelope(VALID_SEMANTIC_RESULT, {
          usage: {
            input_tokens: 12,
            input_tokens_details: { cached_tokens: "8" },
            output_tokens: 4,
          },
        }),
      ),
    );

    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 4,
    });
  });

  it("ignores non-message reasoning output items", async () => {
    const result = await run(async () =>
      respond(
        envelope(VALID_SEMANTIC_RESULT, {
          output: [
            {
              type: "reasoning",
              id: "reasoning-item",
              summary: [],
            },
            assistantMessage([outputText(VALID_SEMANTIC_RESULT)]),
          ],
        }),
      ),
    );

    expect(result.rawContent).toBe(VALID_SEMANTIC_RESULT);
  });

  it("returns empty content when output is absent", async () => {
    const result = await run(async () =>
      respond(
        JSON.stringify({
          object: "response",
          status: "completed",
          usage: {
            input_tokens: 1,
            output_tokens: 0,
          },
        }),
      ),
    );

    expect(result.rawContent).toBe("");
    expect(result.usage).toEqual({
      promptTokens: 1,
      completionTokens: 0,
    });
  });

  it("rejects multiple output_text values", async () => {
    expect(
      await errorCode(
        run(async () =>
          respond(
            envelope("", {
              output: [assistantMessage([outputText(VALID_SEMANTIC_RESULT), outputText(VALID_SEMANTIC_RESULT)])],
            }),
          ),
        ),
      ),
    ).toBe("invalid_schema");
  });

  it("rejects a refusal without exposing the refusal text", async () => {
    const refusalText = "sensitive refusal text";

    try {
      await run(async () =>
        respond(
          envelope("", {
            output: [
              assistantMessage([
                {
                  type: "refusal",
                  refusal: refusalText,
                },
              ]),
            ],
          }),
        ),
      );

      throw new Error("expected rejection");
    } catch (error) {
      expect((error as LlmSemanticError).code).toBe("provider_client_error");

      expect((error as Error).message.includes(refusalText)).toBe(false);
    }
  });

  it("rejects an incomplete response", async () => {
    expect(
      await errorCode(
        run(async () =>
          respond(
            envelope("", {
              status: "incomplete",
              output: [],
              incompleteDetails: {
                reason: "max_output_tokens",
              },
            }),
          ),
        ),
      ),
    ).toBe("provider_client_error");
  });

  it("passes a non-JSON provider envelope to the shared parser unrepaired", async () => {
    const result = await run(async () => respond("not json at all"));

    expect(result.rawContent).toBe("not json at all");
  });
});

describe("HTTP status mapping", () => {
  const cases: Array<[number, string]> = [
    [408, "provider_timeout"],
    [429, "provider_rate_limited"],
    [500, "provider_server_error"],
    [502, "provider_server_error"],
    [503, "provider_server_error"],
    [504, "provider_timeout"],
    [400, "provider_client_error"],
    [401, "provider_client_error"],
  ];

  for (const [status, expected] of cases) {
    it(`maps ${status} to ${expected}`, async () => {
      expect(await errorCode(run(async () => respond("{}", { status })))).toBe(expected);
    });
  }
});

describe("network failures", () => {
  it("maps an aborted request to a timeout", async () => {
    expect(
      await errorCode(
        run(async () => {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }),
      ),
    ).toBe("provider_timeout");
  });

  it("maps a fetch failure to a provider error", async () => {
    expect(
      await errorCode(
        run(async () => {
          throw new TypeError("fetch failed");
        }),
      ),
    ).toBe("provider_error");
  });

  it("does not expose the API key in network errors", async () => {
    try {
      await run(async () => {
        throw new TypeError(`failure involving ${CONFIG.apiKey}`);
      });

      throw new Error("expected rejection");
    } catch (error) {
      expect((error as Error).message.includes(CONFIG.apiKey)).toBe(false);
    }
  });
});

describe("response-size enforcement", () => {
  it("accepts a response exactly at the configured limit", async () => {
    const body = envelopeAtSize(CONFIG.maxResponseBytes);

    expect(encodedLength(body)).toBe(CONFIG.maxResponseBytes);

    const result = await run(async () => respond(body));

    expect(result.byteLength).toBe(CONFIG.maxResponseBytes);
    expect(result.rawContent).toBe(VALID_SEMANTIC_RESULT);
  });

  it("rejects an actual response above the limit", async () => {
    const body = envelopeAtSize(CONFIG.maxResponseBytes) + " ";

    expect(await errorCode(run(async () => respond(body)))).toBe("provider_response_too_large");
  });

  it("rejects an oversized declared content-length", async () => {
    expect(
      await errorCode(
        run(async () =>
          respond("{}", {
            contentLength: String(CONFIG.maxResponseBytes + 1),
          }),
        ),
      ),
    ).toBe("provider_response_too_large");
  });
});
