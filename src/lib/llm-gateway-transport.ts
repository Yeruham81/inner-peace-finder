/**
 * Phase Q2.2 — OpenAI-specific transport.
 *
 * This is the only OpenAI-aware layer.
 *
 * Responsibilities:
 * - OpenAI Responses API endpoint and authentication;
 * - model selection from validated server configuration;
 * - request formatting;
 * - strict Structured Outputs configuration;
 * - abortable timeout handling;
 * - HTTP status mapping;
 * - response-size enforcement;
 * - Responses API envelope extraction;
 * - safe numeric usage metadata.
 *
 * Explicit non-responsibilities:
 * - it does not define the canonical semantic contract;
 * - it does not decide which problem slugs are valid;
 * - it does not read or modify the canonical problem catalog;
 * - it does not repair or translate invented slugs;
 * - it does not build a TherapistSearchPlan;
 * - it does not read or send therapist records;
 * - it does not influence filtering, eligibility, or ranking.
 *
 * The extracted semantic JSON text is passed to the shared Phase 1 parser
 * and validator. The native OpenAI response object never leaves this module.
 */

import {
  LlmProviderClientError,
  LlmProviderError,
  LlmProviderServerError,
  LlmRateLimitedError,
  LlmResponseTooLargeError,
  LlmSemanticError,
  LlmTimeoutError,
} from "./llm-semantic-contract";
import { LLM_PROVIDER_ID, type LlmProviderConfig } from "./llm-provider-config";

/**
 * The expected semantic JSON is very small. This limit includes any model
 * reasoning/output tokens counted by the selected model.
 *
 * It can be adjusted later through evaluation if a chosen model regularly
 * returns incomplete responses.
 */
export const OPENAI_MAX_OUTPUT_TOKENS = 512;

/** Provider-independent transport result. */
export type LlmTransportResult = {
  /** Raw semantic JSON text passed into the shared strict parser. */
  rawContent: string;

  /** Byte length of the complete OpenAI response body. */
  byteLength: number;

  /** Safe numeric usage metadata only. */
  usage?: {
    promptTokens?: number;
    cachedTokens?: number;
    completionTokens?: number;
  };
};

export type LlmTransportRequest = {
  system: string;
  user: string;
  config: LlmProviderConfig;
};

export interface LlmTransport {
  readonly providerId: string;
  request(input: LlmTransportRequest): Promise<LlmTransportResult>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapStatus(status: number): LlmSemanticError {
  if (status === 429) {
    return new LlmRateLimitedError();
  }

  if (status === 408 || status === 504) {
    return new LlmTimeoutError("OpenAI request timed out");
  }

  if (status >= 500) {
    return new LlmProviderServerError(`OpenAI returned status ${status}`);
  }

  return new LlmProviderClientError(`OpenAI returned status ${status}`);
}

function safeTokenCount(value: unknown): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return undefined;
  }

  return value;
}

function extractUsage(root: JsonRecord): LlmTransportResult["usage"] | undefined {
  const usage = root.usage;

  if (!isRecord(usage)) {
    return undefined;
  }

  const promptTokens = safeTokenCount(usage.input_tokens);
  const completionTokens = safeTokenCount(usage.output_tokens);
  const inputTokenDetails = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : undefined;
  const cachedTokens = safeTokenCount(inputTokenDetails?.cached_tokens);

  if (promptTokens === undefined && cachedTokens === undefined && completionTokens === undefined) {
    return undefined;
  }

  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(cachedTokens !== undefined ? { cachedTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
  };
}

/**
 * Read a successful provider response without allowing an unbounded body to
 * be accumulated in memory.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; byteLength: number }> {
  const declaredHeader = response.headers.get("content-length");

  if (declaredHeader !== null) {
    const declaredLength = Number(declaredHeader);

    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new LlmResponseTooLargeError();
    }
  }

  if (!response.body) {
    return {
      text: "",
      byteLength: 0,
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort. Never expose the underlying error.
        }

        throw new LlmResponseTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const completeBody = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    completeBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(completeBody),
    byteLength: totalBytes,
  };
}

/**
 * Strict JSON schema requested from OpenAI.
 *
 * This schema contains semantic fields only. Model and prompt provenance are
 * attached later by the trusted server orchestration layer.
 */
export const OPENAI_RESPONSE_JSON_SCHEMA = {
  name: "semantic_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["matches", "abstained"],
    properties: {
      matches: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slug", "confidence"],
          properties: {
            slug: {
              type: "string",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
          },
        },
      },
      abstained: {
        type: "boolean",
      },
    },
  },
} as const;

/**
 * Extract the single semantic JSON text value from a Responses API envelope.
 *
 * Accepted output:
 * - one assistant message;
 * - one output_text content item;
 * - no refusal.
 *
 * Reasoning and other non-message output items are ignored because they are
 * not application output. Ambiguous or conflicting message content is
 * rejected rather than concatenated or repaired.
 */
function extractOpenAiContent(body: unknown): {
  content: string;
  usage?: LlmTransportResult["usage"];
} {
  if (!isRecord(body)) {
    return {
      content: "",
    };
  }

  const usage = extractUsage(body);
  const status = typeof body.status === "string" ? body.status : undefined;

  if (body.error !== undefined && body.error !== null) {
    throw new LlmProviderServerError("OpenAI returned a failed response");
  }

  if (status === "failed" || status === "cancelled") {
    throw new LlmProviderServerError("OpenAI did not complete the response");
  }

  if (status === "incomplete") {
    const incompleteDetails = isRecord(body.incomplete_details)
      ? body.incomplete_details
      : undefined;

    const reason =
      typeof incompleteDetails?.reason === "string" ? incompleteDetails.reason : undefined;

    /*
     * Retrying the same request with the same max_output_tokens would not
     * correct a deterministic truncation or content-filter outcome.
     */
    if (reason === "max_output_tokens") {
      throw new LlmProviderClientError(
        "OpenAI response exceeded the configured output-token limit",
      );
    }

    if (reason === "content_filter") {
      throw new LlmProviderClientError("OpenAI response was blocked by a content filter");
    }

    throw new LlmProviderServerError("OpenAI returned an incomplete response");
  }

  if (status !== undefined && status !== "completed") {
    throw new LlmProviderServerError("OpenAI returned an unexpected response status");
  }

  if (!Array.isArray(body.output)) {
    return {
      content: "",
      ...(usage ? { usage } : {}),
    };
  }

  const outputTexts: string[] = [];
  let refusalFound = false;

  for (const outputItem of body.output) {
    if (!isRecord(outputItem)) {
      throw new LlmSemanticError("invalid_schema", "OpenAI output contains an invalid item");
    }

    /*
     * The Responses API may include non-message items such as reasoning.
     * Only assistant message output is application-visible semantic text.
     */
    if (outputItem.type !== "message") {
      continue;
    }

    if (outputItem.role !== undefined && outputItem.role !== "assistant") {
      throw new LlmSemanticError("invalid_schema", "OpenAI returned a non-assistant message");
    }

    if (!Array.isArray(outputItem.content)) {
      throw new LlmSemanticError("invalid_schema", "OpenAI message content is invalid");
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        throw new LlmSemanticError(
          "invalid_schema",
          "OpenAI message contains an invalid content item",
        );
      }

      if (contentItem.type === "refusal") {
        refusalFound = true;
        continue;
      }

      if (contentItem.type === "output_text") {
        if (typeof contentItem.text !== "string") {
          throw new LlmSemanticError(
            "invalid_schema",
            "OpenAI output_text item has no string text",
          );
        }

        outputTexts.push(contentItem.text);
        continue;
      }

      throw new LlmSemanticError(
        "invalid_schema",
        "OpenAI message contains an unsupported content type",
      );
    }
  }

  if (refusalFound) {
    /*
     * Never include the provider's refusal text in the error message or logs.
     * This remains a non-retryable provider response.
     */
    throw new LlmProviderClientError("OpenAI refused semantic classification");
  }

  if (outputTexts.length > 1) {
    throw new LlmSemanticError("invalid_schema", "OpenAI returned multiple semantic output texts");
  }

  return {
    content: outputTexts[0] ?? "",
    ...(usage ? { usage } : {}),
  };
}

/**
 * Create the direct OpenAI transport.
 *
 * fetchImpl is injectable so tests can use deterministic mocked Responses API
 * envelopes without credentials, network access, or provider billing.
 */
export function createOpenAiTransport(fetchImpl: FetchLike = fetch): LlmTransport {
  return {
    providerId: LLM_PROVIDER_ID,

    async request({ system, user, config }): Promise<LlmTransportResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);

      let response: Response;

      try {
        response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

            /*
             * The credential remains inside this transport. It is never
             * logged, returned, or included in an error message.
             */
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,

            input: [
              {
                role: "system",
                content: system,
              },
              {
                role: "user",
                content: user,
              },
            ],

            /*
             * Do not retain the response as OpenAI application state.
             */
            store: false,

            /*
             * The required result is only a small JSON object.
             */
            max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,

            ...(config.structuredOutput
              ? {
                  text: {
                    format: {
                      type: "json_schema",
                      ...OPENAI_RESPONSE_JSON_SCHEMA,
                    },
                  },
                }
              : {}),
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof LlmSemanticError) {
          throw error;
        }

        const errorName = (error as { name?: unknown } | null)?.name;

        if (errorName === "AbortError" || errorName === "TimeoutError") {
          throw new LlmTimeoutError();
        }

        /*
         * Never include the native fetch error, request body, URL query,
         * headers, or API credential in the exposed error.
         */
        throw new LlmProviderError("OpenAI network request failed");
      } finally {
        clearTimeout(timer);
      }

      /*
       * Reject a declared oversized body before reading it.
       */
      const declaredHeader = response.headers.get("content-length");

      if (declaredHeader !== null) {
        const declaredLength = Number(declaredHeader);

        if (Number.isFinite(declaredLength) && declaredLength > config.maxResponseBytes) {
          throw new LlmResponseTooLargeError();
        }
      }

      if (!response.ok) {
        throw mapStatus(response.status);
      }

      const { text, byteLength } = await readBodyWithLimit(response, config.maxResponseBytes);

      let parsedEnvelope: unknown;

      try {
        parsedEnvelope = JSON.parse(text);
      } catch {
        /*
         * The OpenAI envelope itself was not JSON. Pass the raw body into the
         * shared strict semantic parser so it becomes malformed_response.
         * Nothing is repaired in this provider layer.
         */
        return {
          rawContent: text,
          byteLength,
        };
      }

      const { content, usage } = extractOpenAiContent(parsedEnvelope);

      return {
        rawContent: content,
        byteLength,
        ...(usage ? { usage } : {}),
      };
    },
  };
}
