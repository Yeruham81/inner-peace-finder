/**
 * Phase Q2.2 — provider-independent server orchestration for semantic
 * classification of `semanticRemainder`.
 *
 * NOT connected to production Unified Search. Production Unified Search
 * continues to use the deterministic `SemanticEngine` as its ONLY semantic
 * classifier: deterministic interpretation, explicit UI-filter validation,
 * profession / modality / population / language / city / delivery-mode /
 * gender / therapist-name extraction, hard-vs-soft routing, eligibility,
 * hard-filter intersections, the semantic gate, ranking and empty-state
 * behavior are all untouched by this module.
 *
 * Out of scope by design: therapist-profile extraction (`extractProfile`)
 * and therapist-profile generation. This boundary has exactly ONE purpose —
 * classifying `semanticRemainder` into validated canonical problem slugs. It
 * must not become a generic LLM endpoint.
 */

import {
  LLM_SEMANTIC_MAX_MATCHES,
  LlmCatalogError,
  LlmInputTooLargeError,
  LlmRequestError,
  LlmSemanticError,
  allowedSlugSet,
  attachServerProvenance,
  parseLlmSemanticResponse,
  type CanonicalProblemEntry,
  type LlmSemanticErrorCode,
  type LlmSemanticResult,
} from "./llm-semantic-contract";
import { LLM_MAX_REMAINDER_LENGTH, type LlmProviderConfig } from "./llm-provider-config";
import { LLM_SEMANTIC_PROMPT_VERSION, buildLlmSemanticPrompt } from "./llm-semantic-prompt";
import type { LlmTransport } from "./llm-gateway-transport";

/* ------------------------------------------------------------------ */
/* Public request contract (the ONLY accepted external shape)          */
/* ------------------------------------------------------------------ */

export type ClassifyQueryRequest = { semanticRemainder: string };

/** The only accepted request property. Everything else is REJECTED. */
export const CLASSIFY_REQUEST_FIELDS = ["semanticRemainder"] as const;

/**
 * Strict request validation. Policy (single, documented): unsupported
 * externally supplied fields are REJECTED (never stripped), so the public
 * contract stays explicit. In particular `allowedProblems`, an allowed-slug
 * set, aliases, canonical names, `modelVersion`, `promptVersion`, structured
 * filters and therapist data are all invalid requests — a caller can neither
 * add, remove, rename nor substitute canonical problem slugs.
 */
export function parseClassifyRequest(payload: unknown): ClassifyQueryRequest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new LlmRequestError("request body must be a JSON object");
  }
  const keys = Object.keys(payload as Record<string, unknown>);
  const unexpected = keys.filter(
    (k) => !(CLASSIFY_REQUEST_FIELDS as readonly string[]).includes(k),
  );
  if (unexpected.length > 0) {
    throw new LlmRequestError(`unsupported request field(s): ${unexpected.sort().join(", ")}`);
  }
  const remainder = (payload as Record<string, unknown>)["semanticRemainder"];
  if (typeof remainder !== "string") {
    throw new LlmRequestError("semanticRemainder must be a string");
  }
  return { semanticRemainder: remainder };
}

/* ------------------------------------------------------------------ */
/* Safe operational logging                                            */
/* ------------------------------------------------------------------ */

/**
 * Structured log record. It intentionally has NO field able to carry the raw
 * mental-health query text, the remainder, the prompt, aliases, credentials,
 * authorization headers, provider payloads, therapist data or user ids.
 */
export type LlmClassifyLog = {
  event: "llm_semantic_classify";
  status: "success" | "error";
  providerId: string;
  modelVersion: string;
  promptVersion: string;
  durationMs: number;
  attempts: number;
  retryCount: number;
  matchCount?: number;
  abstained?: boolean;
  responseSizeCategory?: "empty" | "small" | "large";
  errorCategory?: LlmSemanticErrorCode;
};

export type LlmLogger = (record: LlmClassifyLog) => void;

function sizeCategory(bytes: number): "empty" | "small" | "large" {
  if (bytes <= 0) return "empty";
  return bytes <= 2_048 ? "small" : "large";
}

/* ------------------------------------------------------------------ */
/* Retry policy                                                        */
/* ------------------------------------------------------------------ */

/**
 * At most ONE retry (two attempts total), only for approved transient
 * transport failures. Every deterministic validation failure — unknown slug,
 * alias / display name returned as slug, invalid confidence, abstention
 * conflict, excessive match count, unsupported schema, malformed response,
 * empty response, oversized response, invalid request, oversized input,
 * catalog error, configuration error — is final and never retried.
 */
const RETRYABLE_CODES: ReadonlySet<LlmSemanticErrorCode> = new Set([
  "provider_error",
  "provider_timeout",
  "provider_rate_limited",
  "provider_server_error",
]);

export function isRetryableCode(code: LlmSemanticErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export type ClassifyDeps = {
  /**
   * Server-owned canonical catalog loader — the real server-side data-access
   * path (`SemanticEngine.loadCanonicalProblems`) in production wiring.
   * Read errors propagate as `catalog_error`; a failure is NEVER degraded
   * into a valid empty catalog.
   */
  loadCatalog: () => Promise<CanonicalProblemEntry[]>;
  transport: LlmTransport;
  config: LlmProviderConfig;
  logger?: LlmLogger;
  now?: () => number;
};

function localAbstentionResult(config: LlmProviderConfig): LlmSemanticResult {
  return attachServerProvenance(
    { matches: [], abstained: true },
    { modelVersion: config.model, promptVersion: LLM_SEMANTIC_PROMPT_VERSION },
  );
}

/**
 * Full server classification flow: validate → normalize → server-load the
 * canonical catalog → build the versioned prompt → call the provider through
 * the isolated transport → strict local parse/validate against the
 * SERVER-OWNED slug set → attach trusted server-owned provenance.
 */
export async function classifySemanticRemainder(
  payload: unknown,
  deps: ClassifyDeps,
): Promise<LlmSemanticResult> {
  const { config, transport } = deps;
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  let attempts = 0;
  let lastSize = 0;

  const log = (record: Omit<LlmClassifyLog, "event" | "providerId" | "durationMs">) => {
    deps.logger?.({
      event: "llm_semantic_classify",
      providerId: config.providerId,
      durationMs: now() - startedAt,
      ...record,
    });
  };

  try {
    const request = parseClassifyRequest(payload);
    const remainder = request.semanticRemainder.trim();
    if (remainder.length > LLM_MAX_REMAINDER_LENGTH) {
      throw new LlmInputTooLargeError(
        `semanticRemainder exceeds ${LLM_MAX_REMAINDER_LENGTH} characters`,
      );
    }

    // Empty / whitespace-only remainder → local abstention. No catalog read,
    // no provider call. Abstention is a VALID result, never an error.
    if (remainder.length === 0) {
      const result = localAbstentionResult(config);
      log({
        status: "success",
        modelVersion: result.modelVersion,
        promptVersion: result.promptVersion,
        attempts: 0,
        retryCount: 0,
        matchCount: 0,
        abstained: true,
        responseSizeCategory: "empty",
      });
      return result;
    }

    // Server-owned canonical catalog: the sole validation authority.
    let catalog: CanonicalProblemEntry[];
    try {
      catalog = await deps.loadCatalog();
    } catch (err) {
      throw new LlmCatalogError(
        `canonical catalog read failed: ${err instanceof Error ? err.name : "unknown source"}`,
      );
    }
    if (!Array.isArray(catalog) || catalog.length === 0) {
      // An empty catalog is NOT a valid state for this application: the
      // deterministic engine depends on the same rows.
      throw new LlmCatalogError("canonical catalog is missing or empty");
    }
    const allowed = allowedSlugSet(catalog);
    if (allowed.size === 0) throw new LlmCatalogError("canonical catalog has no valid slugs");

    const prompt = buildLlmSemanticPrompt({
      semanticRemainder: remainder,
      allowedProblems: catalog,
    });

    let lastError: LlmSemanticError | null = null;
    while (attempts < config.maxAttempts) {
      attempts += 1;
      try {
        const providerResult = await transport.request({
          system: prompt.system,
          user: prompt.user,
          config,
        });
        lastSize = providerResult.byteLength;
        if (providerResult.byteLength > config.maxResponseBytes) {
          // Defensive: never salvage or retry an oversized body.
          throw new LlmSemanticError("provider_response_too_large", "provider response too large");
        }
        const core = parseLlmSemanticResponse(providerResult.rawContent, allowed);
        const result = attachServerProvenance(core, {
          // Provenance is server-owned: the configured model id and the
          // prompt constant. Provider-declared versions are rejected by the
          // strict schema and can never override these values.
          modelVersion: config.model,
          promptVersion: LLM_SEMANTIC_PROMPT_VERSION,
        });
        if (result.matches.length > LLM_SEMANTIC_MAX_MATCHES) {
          throw new LlmSemanticError("too_many_matches", "too many matches");
        }
        log({
          status: "success",
          modelVersion: result.modelVersion,
          promptVersion: result.promptVersion,
          attempts,
          retryCount: attempts - 1,
          matchCount: result.matches.length,
          abstained: result.abstained,
          responseSizeCategory: sizeCategory(lastSize),
        });
        return result;
      } catch (err) {
        const typed =
          err instanceof LlmSemanticError
            ? err
            : new LlmSemanticError("internal_error", "unexpected classification failure");
        lastError = typed;
        if (!isRetryableCode(typed.code) || attempts >= config.maxAttempts) throw typed;
      }
    }
    throw lastError ?? new LlmSemanticError("internal_error", "classification did not run");
  } catch (err) {
    const typed =
      err instanceof LlmSemanticError
        ? err
        : new LlmSemanticError("internal_error", "unexpected classification failure");
    log({
      status: "error",
      modelVersion: config.model,
      promptVersion: LLM_SEMANTIC_PROMPT_VERSION,
      attempts,
      retryCount: Math.max(0, attempts - 1),
      responseSizeCategory: sizeCategory(lastSize),
      errorCategory: typed.code,
    });
    throw typed;
  }
}

/* ------------------------------------------------------------------ */
/* HTTP boundary                                                       */
/* ------------------------------------------------------------------ */

/** Documented, stable HTTP mapping for every error category. */
export function httpStatusForCode(code: LlmSemanticErrorCode): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "input_too_large":
      return 413;
    case "provider_rate_limited":
      return 429;
    case "configuration_error":
    case "internal_error":
      return 500;
    case "catalog_error":
      return 503;
    case "provider_timeout":
      return 504;
    // Upstream produced something unusable → bad gateway.
    case "provider_error":
    case "provider_server_error":
    case "provider_client_error":
    case "provider_response_too_large":
    case "empty_response":
    case "malformed_response":
    case "invalid_schema":
    case "unknown_slug":
    case "invalid_confidence":
    case "conflicting_abstention":
    case "too_many_matches":
      return 502;
  }
}

export type ClassifyHttpResponse = {
  status: number;
  body:
    | { matches: LlmSemanticResult["matches"]; abstained: boolean; modelVersion: string; promptVersion: string }
    | { error: { code: LlmSemanticErrorCode } };
};

/**
 * Public response contract. Success returns ONLY the provider-independent
 * validated result; failures return ONLY a stable error category. No raw
 * provider output, provider-native objects, hidden reasoning, prompt text,
 * credentials, authorization headers, stack traces or database details ever
 * cross this boundary.
 */
export async function handleClassifyRequest(
  request: { method: string; text: () => Promise<string> },
  deps: ClassifyDeps,
): Promise<ClassifyHttpResponse> {
  if (request.method !== "POST") {
    return { status: 405, body: { error: { code: "invalid_request" } } };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return { status: 400, body: { error: { code: "invalid_request" } } };
  }
  try {
    const result = await classifySemanticRemainder(payload, deps);
    return {
      status: 200,
      body: {
        matches: result.matches,
        abstained: result.abstained,
        modelVersion: result.modelVersion,
        promptVersion: result.promptVersion,
      },
    };
  } catch (err) {
    const code = err instanceof LlmSemanticError ? err.code : "internal_error";
    return { status: httpStatusForCode(code), body: { error: { code } } };
  }
}