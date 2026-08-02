/**
 * Phase Q2.2 — server-side LLM provider configuration boundary.
 *
 * NOT used by production Unified Search. Only the (disconnected) semantic
 * classification server boundary reads this.
 *
 * Server-side secret names (values never appear in this repository):
 *   - `LOVABLE_API_KEY`      — provider credential (server-only secret).
 *   - `LLM_SEMANTIC_MODEL`   — optional model id override.
 *
 * Credentials are read ONLY from server-side secrets. No client-public
 * prefix (`VITE_*`) and no `import.meta.env` access exists in this module,
 * so provider configuration is unreadable from browser code.
 */

import { LlmConfigurationError } from "./llm-semantic-contract";

/** Stable provider identifier used for logging only. */
export const LLM_PROVIDER_ID = "lovable-ai-gateway";

/** Provider endpoint (OpenAI-compatible chat completions). */
export const LLM_PROVIDER_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Default model id. An explicitly empty override is a configuration error. */
export const DEFAULT_LLM_SEMANTIC_MODEL = "google/gemini-2.5-flash";

/** Strict provider request timeout (ms). Single central constant. */
export const LLM_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Maximum accepted provider response size in bytes. The semantic contract is
 * tiny (at most 3 matches), so 16 KiB is already very generous.
 */
export const LLM_MAX_RESPONSE_BYTES = 16_384;

/** Maximum accepted `semanticRemainder` length in characters. */
export const LLM_MAX_REMAINDER_LENGTH = 500;

/** At most one retry → at most two provider attempts per request. */
export const LLM_MAX_PROVIDER_ATTEMPTS = 2;

export type LlmProviderConfig = {
  readonly providerId: string;
  readonly endpoint: string;
  /** Server-owned model identifier; also used as the result `modelVersion`. */
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  /** Total attempts (1 = no retry, 2 = one retry). Never above 2. */
  readonly maxAttempts: number;
  /** Request strict JSON structured output where the provider supports it. */
  readonly structuredOutput: boolean;
};

export type LlmProviderConfigInput = {
  providerId?: string;
  endpoint?: string;
  model?: string | undefined;
  apiKey?: string | undefined;
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
 * Validate an explicit configuration. Tests inject safe fake values here;
 * no real provider configuration is required by tests or builds.
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

/** Read-only environment view. Only server-side secret names are consulted. */
export type ServerEnv = { get(name: string): string | undefined };

export function envFromRecord(record: Record<string, string | undefined>): ServerEnv {
  return { get: (name) => record[name] };
}

/**
 * Load provider configuration from server-side secrets. Missing credentials
 * or an explicitly empty model override produce a typed configuration error.
 */
export function loadProviderConfigFromEnv(env: ServerEnv): LlmProviderConfig {
  const rawModel = env.get("LLM_SEMANTIC_MODEL");
  return createProviderConfig({
    apiKey: env.get("LOVABLE_API_KEY"),
    model: rawModel === undefined ? DEFAULT_LLM_SEMANTIC_MODEL : rawModel,
  });
}
