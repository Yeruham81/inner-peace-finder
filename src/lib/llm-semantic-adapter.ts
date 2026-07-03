/**
 * LLM Semantic Adapter (Phase 11 — ISOLATED interface definition only).
 *
 * ⚠️  NOT IMPORTED BY PRODUCTION CODE. Do not wire this into the classifier,
 *     search pipeline, or extraction path. It exists solely so a future
 *     LLM-backed provider can slot behind the existing engine seam without
 *     churn.
 *
 * Contract mirrors `SemanticClassifier` / `SemanticEngine` on purpose so the
 * eventual swap is mechanical: adapter → engine → call sites, no shape change.
 */

import type { SemanticProfileEntry } from "./therapist-semantic-profile";
import type { ClassificationResult } from "./semantic-classifier";

export interface LlmSemanticAdapter {
  /** Classify a free-text Hebrew query into ranked problem slugs. */
  classify(input: string): Promise<ClassificationResult>;

  /** Derive a semantic profile from a therapist's full_description. */
  extractProfile(fullDescription: string): Promise<SemanticProfileEntry[]>;

  /**
   * Optional: score the semantic overlap between two profiles when the model
   * provides its own similarity signal (e.g. embeddings cosine).
   */
  similarity?(
    userProfile: SemanticProfileEntry[],
    therapistProfile: SemanticProfileEntry[],
  ): Promise<number>;

  /** Provider tag for observability (e.g. "openai:gpt-4o-mini"). */
  readonly source: string;
}

/**
 * Placeholder — throws if used. Present so type imports resolve without
 * pulling any network / API-key surface into the bundle.
 */
export const NoopLlmAdapter: LlmSemanticAdapter = {
  source: "noop",
  async classify() {
    throw new Error("LLM adapter not configured");
  },
  async extractProfile() {
    throw new Error("LLM adapter not configured");
  },
};