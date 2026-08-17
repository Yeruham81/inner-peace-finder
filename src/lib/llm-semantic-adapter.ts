/**
 * Phase Q2 — provider-independent LLM semantic adapter boundary.
 *
 * Contains NO provider, credentials or network calls. The production server
 * semantic route may use these pure contracts, while provider access remains
 * isolated behind the server-only orchestrator.
 *
 * Scope of this boundary (hard limits):
 *   - Input is ONLY the unresolved `semanticRemainder` plus the canonical
 *     problem catalog. Deterministic interpretation stays authoritative for
 *     explicit UI-filter validation and for profession / modality /
 *     population / language / city / delivery-mode / gender / therapist-name
 *     extraction, hard-vs-soft routing, eligibility and ranking.
 *   - Therapist-profile extraction is OUT OF SCOPE for the LLM.
 *   - No therapist records, user identifiers, auth data or soft-preference
 *     state may ever be passed here.
 */

import {
  LLM_SEMANTIC_MAX_MATCHES,
  LlmSemanticError,
  type CanonicalProblemEntry,
  type LlmSemanticResult,
} from "./llm-semantic-contract";

export { LLM_SEMANTIC_MAX_MATCHES };

/** The ONLY input a semantic classifier is allowed to receive. */
export type LlmSemanticInput = {
  /** Unresolved remainder produced by deterministic interpretation. */
  semanticRemainder: string;
  /** Canonical problem catalog (slug is the only valid identifier). */
  allowedProblems: CanonicalProblemEntry[];
};

export interface LlmSemanticClassifier {
  /** Provider tag for observability (e.g. "noop", "fake"). */
  readonly source: string;
  classify(input: LlmSemanticInput): Promise<LlmSemanticResult>;
}

/** A local abstention — produced without invoking any provider. */
export function localAbstention(
  modelVersion = "local",
  promptVersion = "local",
): LlmSemanticResult {
  return { matches: [], abstained: true, modelVersion, promptVersion };
}

export function isBlankRemainder(remainder: string | null | undefined): boolean {
  return typeof remainder !== "string" || remainder.trim().length === 0;
}

/**
 * Wrap any classifier so an empty / whitespace-only `semanticRemainder`
 * short-circuits to a local abstention WITHOUT invoking the provider.
 */
export function withLocalAbstention(inner: LlmSemanticClassifier): LlmSemanticClassifier {
  return {
    source: inner.source,
    async classify(input: LlmSemanticInput): Promise<LlmSemanticResult> {
      if (isBlankRemainder(input.semanticRemainder)) return localAbstention();
      return inner.classify(input);
    },
  };
}

/**
 * Placeholder classifier — throws if invoked. Present so type imports resolve
 * without pulling any network / API-key surface into the bundle.
 */
export const NoopLlmSemanticClassifier: LlmSemanticClassifier = {
  source: "noop",
  async classify() {
    throw new LlmSemanticError("provider_error", "LLM semantic classifier not configured");
  },
};
