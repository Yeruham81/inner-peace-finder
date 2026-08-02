/**
 * Phase Q2.2 — server-side OpenAI provider configuration boundary.
 *
 * NOT used by production Unified Search. Only the disconnected semantic
 * classification server boundary reads this configuration.
 *
 * Server-side configuration names:
 *   - `OPENAI_API_KEY` — OpenAI API credential. Server-side secret only.
 *   - `OPENAI_MODEL`   — explicit OpenAI model identifier.
 *
 * Both values are mandatory. There is deliberately no fallback model.
 *
 * Credentials are read only from server-side configuration. This module does
 * not read client-public environment variables and must not be imported into
 * browser code.
 */

import { LlmConfigurationError } from "./llm-semantic-contract";

/** Stable provider identifier used for operational metadata and logging. */
export const LLM_PROVIDER_ID = "openai";

/** Direct OpenAI Responses API endpoint. */
export const LLM_PROVIDER_ENDPOINT = "https://api.openai.com/v1/responses";

/** Strict provider request timeout in milliseconds. */
export const LLM_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Maximum accepted provider response size in bytes.
 *
 * The semantic response is intentionally small—at most three matches—so
 * 16 KiB is already a generous upper limit.
 */
export const LLM_MAX_RESPONSE_BYTES = 16_384;

/** Maximum accepted `semanticRemainder` length in characters. */
export const LLM_MAX_REMAINDER_LENGTH = 500;

/** At most one retry, for a maximum of two provider attempts per request. */
export const LLM_MAX_PROVIDER_ATTEMPTS = 2;

export type LlmProviderConfig = {
  readonly providerId: string;
  readonly endpoint: string;

  /**
   * Explicit server-owned OpenAI model identifier.
   * This is also used as the validated result's `modelVersion`.
   */
  readonly model: string;

  /** Server-side OpenAI API credential. */
  readonly apiKey: string;

  readonly timeoutMs: number;
  readonly maxResponseBytes: number;

  /** Total attempts: 1 means no retry; 2 means at most one retry. */
  readonly maxAttempts: number;

  /** Request strict JSON-schema Structured Outputs. */
  readonly structuredOutput: boolean;
};

export type LlmProviderConfigInput = {
  providerId?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxAttempts?: number;
  structuredOutput?: boolean;
};

function requireNonEmpty(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LlmConfigurationError(`${field} is missing or empty`);
  }

  return value.trim();
}

function requireIntInRange(value: number, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new LlmConfigurationError(`${field} must be an integer within [${min}, ${max}]`);
  }

  return value;
}

/**
 * Validate explicit provider configuration.
 *
 * Tests may inject safe fake values here, so builds and test runs do not
 * require real OpenAI credentials or network access.
 */
export function createProviderConfig(input: LlmProviderConfigInput): LlmProviderConfig {
  const endpoint = requireNonEmpty(input.endpoint ?? LLM_PROVIDER_ENDPOINT, "endpoint");

  if (!endpoint.startsWith("https://")) {
    throw new LlmConfigurationError("endpoint must use https");
  }

  return {
    providerId: requireNonEmpty(input.providerId ?? LLM_PROVIDER_ID, "providerId"),
    endpoint,
    model: requireNonEmpty(input.model, "model"),
    apiKey: requireNonEmpty(input.apiKey, "apiKey"),
    timeoutMs: requireIntInRange(input.timeoutMs ?? LLM_REQUEST_TIMEOUT_MS, "timeoutMs", 1, 60_000),
    maxResponseBytes: requireIntInRange(
      input.maxResponseBytes ?? LLM_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
      256,
      1_000_000,
    ),
    maxAttempts: requireIntInRange(
      input.maxAttempts ?? LLM_MAX_PROVIDER_ATTEMPTS,
      "maxAttempts",
      1,
      LLM_MAX_PROVIDER_ATTEMPTS,
    ),
    structuredOutput: input.structuredOutput ?? true,
  };
}

/** Read-only server environment abstraction used for dependency injection. */
export type ServerEnv = {
  get(name: string): string | undefined;
};

export function envFromRecord(record: Record<string, string | undefined>): ServerEnv {
  return {
    get: (name) => record[name],
  };
}

/**
 * Load direct OpenAI configuration from server-side environment values.
 *
 * Both `OPENAI_API_KEY` and `OPENAI_MODEL` are mandatory. Missing, empty, or
 * whitespace-only values produce a typed `LlmConfigurationError`.
 */
export function loadProviderConfigFromEnv(env: ServerEnv): LlmProviderConfig {
  return createProviderConfig({
    apiKey: env.get("OPENAI_API_KEY"),
    model: env.get("OPENAI_MODEL"),
  });
}
