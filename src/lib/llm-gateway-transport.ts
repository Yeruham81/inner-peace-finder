/**
 * Phase Q2.2 — PROVIDER-SPECIFIC transport (the only provider-aware layer).
 *
 * Responsibilities (provider concerns only): URL, headers, authentication,
 * model selection, structured-output configuration, request formatting,
 * response extraction, status codes, timeouts, network errors, usage
 * metadata.
 *
 * Explicit non-responsibilities: it does not define the canonical semantic
 * contract, does not decide which slugs are valid, never touches the
 * canonical catalog, never repairs invented slugs, never builds a
 * TherapistSearchPlan, never reads therapist records and never influences
 * ranking. Its extracted payload is handed to the shared Phase 1 parser and
 * validator; its native response shape never escapes this module.
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
import type { LlmProviderConfig } from "./llm-provider-config";

/** Provider-independent transport result: raw semantic text + safe metadata. */
export type LlmTransportResult = {
  /** Raw model text — always fed into the shared strict parser. */
  rawContent: string;
  /** Byte length of the provider body (safe, non-sensitive). */
  byteLength: number;
  /** Provider-native usage metadata, numeric only. */
  usage?: { promptTokens?: number; completionTokens?: number };
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

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function mapStatus(status: number): LlmSemanticError {
  if (status === 429) return new LlmRateLimitedError();
  if (status === 408 || status === 504) return new LlmTimeoutError("provider gateway timeout");
  if (status >= 500) return new LlmProviderServerError(`provider status ${status}`);
  return new LlmProviderClientError(`provider status ${status}`);
}

/**
 * Extract the semantic text from the provider-native body. Only the message
 * content and numeric usage counters cross this boundary — never the native
 * object, never hidden reasoning, never request ids.
 */
function extractContent(body: unknown): { content: string; usage?: LlmTransportResult["usage"] } {
  const root = body as
    | {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      }
    | null
    | undefined;
  const content = root?.choices?.[0]?.message?.content;
  const usage =
    typeof root?.usage?.prompt_tokens === "number" ||
    typeof root?.usage?.completion_tokens === "number"
      ? {
          promptTokens:
            typeof root?.usage?.prompt_tokens === "number" ? root.usage.prompt_tokens : undefined,
          completionTokens:
            typeof root?.usage?.completion_tokens === "number"
              ? root.usage.completion_tokens
              : undefined,
        }
      : undefined;
  return { content: typeof content === "string" ? content : "", usage };
}

/** Strict JSON schema requested from the provider — SEMANTIC FIELDS ONLY. */
export const PROVIDER_RESPONSE_JSON_SCHEMA = {
  name: "semantic_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["matches", "abstained"],
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slug", "confidence"],
          properties: {
            slug: { type: "string" },
            confidence: { type: "number" },
          },
        },
      },
      abstained: { type: "boolean" },
    },
  },
} as const;

/**
 * Create the live provider transport. `fetchImpl` is injectable so tests use
 * deterministic scripted responses and never touch the network.
 */
export function createGatewayTransport(fetchImpl: FetchLike = fetch): LlmTransport {
  return {
    providerId: "lovable-ai-gateway",
    async request({ system, user, config }): Promise<LlmTransportResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Credential stays inside this module; never logged, never returned.
            "Lovable-API-Key": config.apiKey,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            ...(config.structuredOutput
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: PROVIDER_RESPONSE_JSON_SCHEMA,
                  },
                }
              : {}),
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof LlmSemanticError) throw err;
        const name = (err as { name?: string } | null)?.name;
        if (name === "AbortError" || name === "TimeoutError") {
          throw new LlmTimeoutError();
        }
        // Never include the provider payload or headers in the message.
        throw new LlmProviderError("provider network failure");
      } finally {
        clearTimeout(timer);
      }

      // Reject oversized bodies BEFORE trusting the content, using the
      // declared length when the provider supplies it.
      const declared = Number(response.headers?.get?.("content-length") ?? "");
      if (Number.isFinite(declared) && declared > config.maxResponseBytes) {
        throw new LlmResponseTooLargeError();
      }
      if (!response.ok) throw mapStatus(response.status);

      const text = await response.text();
      const size = byteLength(text);
      if (size > config.maxResponseBytes) throw new LlmResponseTooLargeError();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // The provider envelope itself was not JSON: hand the raw text to the
        // shared parser, which rejects it as malformed (never repaired here).
        return { rawContent: text, byteLength: size };
      }
      const { content, usage } = extractContent(parsed);
      return { rawContent: content, byteLength: size, ...(usage ? { usage } : {}) };
    },
  };
}